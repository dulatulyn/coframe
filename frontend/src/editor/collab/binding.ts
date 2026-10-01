import * as Y from "yjs";

import { hasService, service, type BpmnEditor } from "../modeler";
import { alignOrder, diffDocs, flattenXml, isEmptyDiff, reconstructXml, type FlatDoc } from "./flat";
import type { DiagramSession } from "./session";
import { applyDiff, readElements } from "./ydoc";

export const LOCAL = "coframe:local";
export const SANITIZE = "coframe:sanitize";
export const AI_APPLYING_EVENT = "coframe.ai.applying";

type Viewbox = { x: number; y: number; width: number; height: number };
type ViewState = { viewbox: Viewbox; rootId: string | null; selection: string[] };
type Element = { id: string };

const IDLE_EVENTS = [
  "drag.cleanup",
  "directEditing.complete",
  "directEditing.cancel",
  "popupMenu.close",
  "searchPad.closed",
];

export type BindingOptions = {
  readOnly: boolean;
  isEditingOutside?: () => boolean;
  onError?: (error: unknown) => void;
  onRendered?: () => void;
  onLocalChange?: () => void;
};

export class BpmnBinding {
  private shadow: FlatDoc = {};
  private undoManager: Y.UndoManager | null = null;
  private syncing = false;
  private syncAgain = false;
  private applying = false;
  private remotePending = false;
  private frame = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private waitingForIdle = false;
  private pendingSelection: string[] | null = null;
  private disposed = false;
  private rendered = false;
  private cleanups: (() => void)[] = [];
  private aiTag: string | null = null;
  private tagging: string | null = null;

  constructor(
    private readonly editor: BpmnEditor,
    private readonly session: DiagramSession,
    private readonly options: BindingOptions,
  ) {}

  get canUndo(): boolean {
    return !!this.undoManager && this.undoManager.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return !!this.undoManager && this.undoManager.redoStack.length > 0;
  }

  async start(): Promise<void> {
    await this.importFromY();
    if (this.disposed) return;
    if (!this.options.readOnly) this.attachLocal();
    const onChange = (_events: unknown, transaction: Y.Transaction) => {
      if (transaction.origin === LOCAL || transaction.origin === SANITIZE) return;
      this.scheduleRemoteApply();
    };
    this.session.elements.observeDeep(onChange);
    this.cleanups.push(() => this.session.elements.unobserveDeep(onChange));
  }

  undo(): void {
    this.undoManager?.undo();
  }

  redo(): void {
    this.undoManager?.redo();
  }

  isLastChange(tag: string): boolean {
    return this.undoManager?.undoStack.at(-1)?.meta.get("ai") === tag;
  }

  undoChange(tag: string): boolean {
    if (!this.isLastChange(tag)) return false;
    this.undo();
    return true;
  }

  dispose(): void {
    this.disposed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.undoManager?.destroy();
  }

  private attachLocal(): void {
    const eventBus = service(this.editor, "eventBus");
    const onCommand = (event: { trigger?: string }) => {
      if (this.applying || event.trigger === "clear") return;
      void this.syncLocal();
    };
    eventBus.on("commandStack.changed", onCommand);
    this.cleanups.push(() => eventBus.off("commandStack.changed", onCommand));
    const onAiApplying = ({ tag }: { tag: string }) => {
      this.aiTag = tag;
    };
    eventBus.on(AI_APPLYING_EVENT, onAiApplying);
    this.cleanups.push(() => eventBus.off(AI_APPLYING_EVENT, onAiApplying));

    const undoManager = new Y.UndoManager(this.session.elements, {
      trackedOrigins: new Set([LOCAL]),
      captureTimeout: 0,
    });
    undoManager.on("stack-item-added", ({ stackItem, type }: { stackItem: { meta: Map<string, unknown> }; type: string }) => {
      stackItem.meta.set("selection", this.currentSelection());
      if (type === "undo" && this.tagging) stackItem.meta.set("ai", this.tagging);
    });
    undoManager.on("stack-item-popped", ({ stackItem }: { stackItem: { meta: Map<string, unknown> } }) => {
      this.pendingSelection = (stackItem.meta.get("selection") as string[] | undefined) ?? null;
    });
    this.undoManager = undoManager;

    if (hasService(this.editor, "editorActions")) {
      const editorActions = service(this.editor, "editorActions");
      for (const action of ["undo", "redo"]) {
        if (editorActions.isRegistered(action)) editorActions.unregister(action);
      }
      editorActions.register({ undo: () => this.undo(), redo: () => this.redo() });
    }
  }

  private async syncLocal(): Promise<void> {
    if (this.syncing) {
      this.syncAgain = true;
      return;
    }
    this.syncing = true;
    try {
      do {
        this.syncAgain = false;
        const tag = this.aiTag;
        const { xml } = await this.editor.saveXML({ format: false });
        if (!xml || this.disposed) return;
        const next = alignOrder(flattenXml(xml), this.shadow);
        const diff = diffDocs(this.shadow, next);
        if (tag && this.aiTag === tag) this.aiTag = null;
        if (!isEmptyDiff(diff)) {
          this.tagging = tag;
          try {
            this.session.doc.transact(() => applyDiff(this.session.elements, diff), LOCAL);
          } finally {
            this.tagging = null;
          }
          this.options.onLocalChange?.();
        }
        this.shadow = next;
      } while (this.syncAgain);
    } catch (error) {
      this.options.onError?.(error);
    } finally {
      this.syncing = false;
      if (this.remotePending) this.scheduleRemoteApply();
    }
  }

  private scheduleRemoteApply(): void {
    this.remotePending = true;
    if (this.frame || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      void this.applyRemote();
    });
  }

  private async applyRemote(): Promise<void> {
    if (!this.remotePending || this.disposed) return;
    if (this.applying || this.syncing) {
      this.retryLater(30);
      return;
    }
    if (this.isInteracting()) {
      this.waitForIdle();
      return;
    }
    this.remotePending = false;
    await this.importFromY();
  }

  private retryLater(ms: number): void {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.scheduleRemoteApply();
    }, ms);
  }

  private isInteracting(): boolean {
    const get = (name: string) => (hasService(this.editor, name) ? service(this.editor, name) : null);
    return Boolean(
      get("dragging")?.context() ||
        get("directEditing")?.isActive() ||
        get("popupMenu")?.isOpen() ||
        get("searchPad")?.isOpen?.() ||
        this.options.isEditingOutside?.(),
    );
  }

  private waitForIdle(): void {
    if (this.waitingForIdle) return;
    this.waitingForIdle = true;
    const eventBus = service(this.editor, "eventBus");
    let poll: ReturnType<typeof setInterval> | null = null;
    const done = () => {
      eventBus.off(IDLE_EVENTS, done);
      if (poll) clearInterval(poll);
      this.waitingForIdle = false;
      setTimeout(() => this.scheduleRemoteApply(), 0);
    };
    eventBus.on(IDLE_EVENTS, done);
    poll = setInterval(() => {
      if (!this.isInteracting()) done();
    }, 250);
    this.cleanups.push(() => {
      eventBus.off(IDLE_EVENTS, done);
      if (poll) clearInterval(poll);
    });
  }

  private async importFromY(): Promise<void> {
    const remote = readElements(this.session.elements);
    if (Object.keys(remote).length === 0) return;
    if (this.rendered && isEmptyDiff(diffDocs(this.shadow, remote))) return;

    const view = this.rendered ? this.captureView() : null;
    this.applying = true;
    try {
      await this.editor.importXML(reconstructXml(remote));
    } catch (error) {
      this.options.onError?.(error);
      return;
    } finally {
      this.applying = false;
    }
    if (this.disposed) return;
    if (view) this.restoreView(view);
    else this.fitInitially();

    const { xml } = await this.editor.saveXML({ format: false });
    if (!xml) return;
    const drawn = alignOrder(flattenXml(xml), remote);
    this.shadow = drawn;
    if (!this.options.readOnly) {
      const cleanup = diffDocs(remote, drawn);
      if (!isEmptyDiff(cleanup)) this.session.doc.transact(() => applyDiff(this.session.elements, cleanup), SANITIZE);
    }
    this.rendered = true;
    this.options.onRendered?.();
  }

  private currentSelection(): string[] {
    if (!hasService(this.editor, "selection")) return [];
    return (service(this.editor, "selection").get() as Element[]).map((e) => e.id);
  }

  private captureView(): ViewState | null {
    try {
      const canvas = service(this.editor, "canvas");
      const { x, y, width, height } = canvas.viewbox();
      return {
        viewbox: { x, y, width, height },
        rootId: canvas.getRootElement()?.id ?? null,
        selection: this.pendingSelection ?? this.currentSelection(),
      };
    } finally {
      this.pendingSelection = null;
    }
  }

  private restoreView(view: ViewState): void {
    const canvas = service(this.editor, "canvas");
    const registry = service(this.editor, "elementRegistry");
    if (view.rootId) {
      const root = registry.get(view.rootId);
      if (root && canvas.getRootElement() !== root) canvas.setRootElement(root);
    }
    canvas.viewbox(view.viewbox);
    if (hasService(this.editor, "selection")) {
      const elements = view.selection.map((id) => registry.get(id)).filter(Boolean);
      service(this.editor, "selection").select(elements);
    }
  }

  private fitInitially(): void {
    const canvas = service(this.editor, "canvas");
    canvas.zoom("fit-viewport", "auto");
    const { scale } = canvas.viewbox();
    if (scale > 1) canvas.zoom(1, "auto");
    else canvas.zoom(scale * 0.9, "auto");
  }
}
