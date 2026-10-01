import type { Awareness } from "y-protocols/awareness";

import { initials, type PresenceUser } from "@/components/editor-chrome/presence";

import { hasService, service, type BpmnEditor } from "../modeler";

export type Peer = {
  clientId: number;
  user: PresenceUser;
  cursor: { x: number; y: number } | null;
  root: string | null;
  selection: string[];
};

type AwarenessState = {
  user?: PresenceUser;
  cursor?: { x: number; y: number } | null;
  root?: string | null;
  selection?: string[];
};

const SVG_NS = "http://www.w3.org/2000/svg";
const CURSOR_INTERVAL_MS = 40;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function avatarHtml(user: PresenceUser, size: number): string {
  const img = user.avatarUrl
    ? `<img src="${escapeHtml(user.avatarUrl)}" alt="" referrerpolicy="no-referrer" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.remove()">`
    : "";
  return `<span style="position:relative;display:inline-grid;place-items:center;width:${size}px;height:${size}px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.22);box-shadow:0 0 0 1px rgba(255,255,255,.55);font-size:${Math.round(size * 0.42)}px;font-weight:600">${escapeHtml(initials(user.name))}${img}</span>`;
}

export class PresenceController {
  private cursors = new Map<number, HTMLElement>();
  private tags = new Map<number, HTMLElement>();
  private layer: SVGGElement | null = null;
  private lastSent = 0;
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCursor: { x: number; y: number } | null = null;
  private listeners = new Set<(peers: Peer[]) => void>();
  private cleanups: (() => void)[] = [];
  peers: Peer[] = [];

  constructor(
    private readonly editor: BpmnEditor,
    private readonly awareness: Awareness,
    private readonly container: HTMLElement,
    private readonly overlay: HTMLElement,
    me: PresenceUser,
  ) {
    awareness.setLocalState({ user: me, cursor: null, root: null, selection: [] } satisfies AwarenessState);
  }

  start(): void {
    const eventBus = service(this.editor, "eventBus");
    const canvas = service(this.editor, "canvas");
    this.layer = canvas.getLayer("collab-selections", 900) as SVGGElement;

    const onMove = (event: PointerEvent) => this.queueCursor(this.toDiagram(event));
    const onLeave = () => this.queueCursor(null);
    this.container.addEventListener("pointermove", onMove);
    this.container.addEventListener("pointerleave", onLeave);
    this.cleanups.push(() => {
      this.container.removeEventListener("pointermove", onMove);
      this.container.removeEventListener("pointerleave", onLeave);
    });

    const onSelection = () => {
      const selected = hasService(this.editor, "selection")
        ? (service(this.editor, "selection").get() as { id: string }[]).map((e) => e.id)
        : [];
      this.awareness.setLocalStateField("selection", selected);
    };
    const onRoot = () => {
      this.awareness.setLocalStateField("root", canvas.getRootElement()?.id ?? null);
      this.render();
    };
    const onView = () => this.render();
    eventBus.on("selection.changed", onSelection);
    eventBus.on("root.set", onRoot);
    eventBus.on("canvas.viewbox.changed", onView);
    eventBus.on("import.done", onView);
    eventBus.on("elements.changed", onView);
    this.cleanups.push(() => {
      eventBus.off("selection.changed", onSelection);
      eventBus.off("root.set", onRoot);
      eventBus.off("canvas.viewbox.changed", onView);
      eventBus.off("import.done", onView);
      eventBus.off("elements.changed", onView);
    });

    const onAwareness = () => {
      this.peers = this.readPeers();
      this.render();
      for (const listener of this.listeners) listener(this.peers);
    };
    this.awareness.on("change", onAwareness);
    this.cleanups.push(() => this.awareness.off("change", onAwareness));
    onRoot();
    onAwareness();
  }

  subscribe(listener: (peers: Peer[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.peers);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    if (this.sendTimer) clearTimeout(this.sendTimer);
    this.awareness.setLocalStateField("cursor", null);
    for (const el of [...this.cursors.values(), ...this.tags.values()]) el.remove();
    this.cursors.clear();
    this.tags.clear();
    this.layer?.replaceChildren();
    this.listeners.clear();
  }

  jumpTo(clientId: number): void {
    const peer = this.peers.find((p) => p.clientId === clientId);
    if (!peer) return;
    const canvas = service(this.editor, "canvas");
    const registry = service(this.editor, "elementRegistry");
    if (peer.root && canvas.getRootElement()?.id !== peer.root) {
      const root = registry.get(peer.root);
      if (root) canvas.setRootElement(root);
    }
    const target = peer.cursor ?? this.selectionCenter(peer);
    if (!target) return;
    const vb = canvas.viewbox();
    canvas.viewbox({ x: target.x - vb.width / 2, y: target.y - vb.height / 2, width: vb.width, height: vb.height });
  }

  private selectionCenter(peer: Peer): { x: number; y: number } | null {
    const registry = service(this.editor, "elementRegistry");
    const el = peer.selection.map((id) => registry.get(id)).find(Boolean);
    return el && el.width !== undefined ? { x: el.x + el.width / 2, y: el.y + el.height / 2 } : null;
  }

  private readPeers(): Peer[] {
    const peers: Peer[] = [];
    this.awareness.getStates().forEach((raw, clientId) => {
      if (clientId === this.awareness.clientID) return;
      const state = raw as AwarenessState;
      if (!state?.user) return;
      peers.push({
        clientId,
        user: state.user,
        cursor: state.cursor ?? null,
        root: state.root ?? null,
        selection: Array.isArray(state.selection) ? state.selection.slice(0, 200) : [],
      });
    });
    return peers;
  }

  private queueCursor(point: { x: number; y: number } | null): void {
    this.pendingCursor = point;
    const now = performance.now();
    const wait = CURSOR_INTERVAL_MS - (now - this.lastSent);
    if (wait <= 0 || point === null) {
      this.flushCursor();
    } else if (!this.sendTimer) {
      this.sendTimer = setTimeout(() => this.flushCursor(), wait);
    }
  }

  private flushCursor(): void {
    if (this.sendTimer) clearTimeout(this.sendTimer);
    this.sendTimer = null;
    this.lastSent = performance.now();
    this.awareness.setLocalStateField("cursor", this.pendingCursor);
  }

  private toDiagram(event: PointerEvent): { x: number; y: number } {
    const rect = this.container.getBoundingClientRect();
    const vb = service(this.editor, "canvas").viewbox();
    return {
      x: Math.round(vb.x + (event.clientX - rect.left) / vb.scale),
      y: Math.round(vb.y + (event.clientY - rect.top) / vb.scale),
    };
  }

  private toScreen(point: { x: number; y: number }): { x: number; y: number } {
    const vb = service(this.editor, "canvas").viewbox();
    return { x: (point.x - vb.x) * vb.scale, y: (point.y - vb.y) * vb.scale };
  }

  private render(): void {
    const canvas = service(this.editor, "canvas");
    const registry = service(this.editor, "elementRegistry");
    const rootId = canvas.getRootElement()?.id ?? null;
    const visible = this.peers.filter((p) => !p.root || !rootId || p.root === rootId);
    const alive = new Set(visible.map((p) => p.clientId));

    for (const [id, el] of this.cursors) {
      if (alive.has(id)) continue;
      el.remove();
      this.cursors.delete(id);
    }
    for (const [id, el] of this.tags) {
      if (alive.has(id)) continue;
      el.remove();
      this.tags.delete(id);
    }

    const frames: SVGElement[] = [];
    for (const peer of visible) {
      let cursor = this.cursors.get(peer.clientId);
      if (!cursor) {
        cursor = document.createElement("div");
        cursor.className = "collab-cursor";
        this.overlay.appendChild(cursor);
        this.cursors.set(peer.clientId, cursor);
      }
      const key = `${peer.user.name}|${peer.user.color}|${peer.user.avatarUrl ?? ""}`;
      if (cursor.dataset.key !== key) {
        cursor.dataset.key = key;
        cursor.innerHTML =
          `<svg width="18" height="20" viewBox="0 0 18 20"><path d="M2 1.5 16 9.2l-6.3 1.6-3.2 6.1Z" fill="${escapeHtml(peer.user.color)}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg>` +
          `<span class="collab-cursor-label" style="background:${escapeHtml(peer.user.color)}">${avatarHtml(peer.user, 16)}${escapeHtml(peer.user.name)}</span>`;
      }
      if (peer.cursor) {
        const p = this.toScreen(peer.cursor);
        cursor.style.transform = `translate(${p.x}px, ${p.y}px)`;
        cursor.style.opacity = "1";
      } else {
        cursor.style.opacity = "0";
      }

      let tagPlaced = false;
      for (const id of peer.selection) {
        const el = registry.get(id);
        if (!el || el.id === rootId) continue;
        const frame = this.frameFor(el, peer.user.color);
        if (frame) frames.push(frame);
        if (!tagPlaced && el.width !== undefined) {
          tagPlaced = true;
          let tag = this.tags.get(peer.clientId);
          if (!tag) {
            tag = document.createElement("div");
            tag.className = "collab-tag";
            this.overlay.appendChild(tag);
            this.tags.set(peer.clientId, tag);
          }
          tag.textContent = peer.user.name;
          tag.style.background = peer.user.color;
          const p = this.toScreen({ x: el.x - 6, y: el.y - 6 });
          tag.style.transform = `translate(${p.x}px, ${p.y - 20}px)`;
          tag.style.display = "block";
        }
      }
      if (!tagPlaced) {
        const tag = this.tags.get(peer.clientId);
        if (tag) tag.style.display = "none";
      }
    }
    this.layer?.replaceChildren(...frames);
  }

  private frameFor(el: any, color: string): SVGElement | null {
    if (el.waypoints) {
      const path = document.createElementNS(SVG_NS, "polyline");
      path.setAttribute("points", el.waypoints.map((p: { x: number; y: number }) => `${p.x},${p.y}`).join(" "));
      path.setAttribute("class", "collab-selection");
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-opacity", "0.55");
      path.setAttribute("stroke-width", "6");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      return path;
    }
    if (el.width === undefined) return null;
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(el.x - 6));
    rect.setAttribute("y", String(el.y - 6));
    rect.setAttribute("width", String(el.width + 12));
    rect.setAttribute("height", String(el.height + 12));
    rect.setAttribute("class", "collab-selection");
    rect.setAttribute("stroke", color);
    return rect;
  }
}
