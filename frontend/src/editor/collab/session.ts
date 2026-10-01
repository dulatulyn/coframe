import * as decoding from "lib0/decoding";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";
import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";

import { wsBaseUrl } from "@/lib/ws";

import { dropOtherGenerations, localCopyName } from "./local-copy";
import { getElements, type ElementsMap } from "./ydoc";

const MESSAGE_PERSISTED = 100;
const OFFLINE_START_MS = 4000;

export type ConnectionState = "connecting" | "online" | "offline";
export type SaveState = "saved" | "saving" | "offline" | "local";
export type SessionEnd = { code: number; reason: string };

type Listener = () => void;

export class DiagramSession {
  readonly doc = new Y.Doc();
  readonly elements: ElementsMap;
  readonly provider: WebsocketProvider;
  readonly local: IndexeddbPersistence | null = null;

  connection: ConnectionState = "connecting";
  synced = false;
  localLoaded = false;
  ended: SessionEnd | null = null;
  private persisted = new Map<number, number>();
  private persistedAt = 0;
  private localChangeAt = 0;
  private listeners = new Set<Listener>();

  constructor(
    readonly diagramId: string,
    { generation = 0, keepLocalCopy = true }: { generation?: number; keepLocalCopy?: boolean } = {},
  ) {
    this.elements = getElements(this.doc);
    if (keepLocalCopy && typeof indexedDB !== "undefined") {
      try {
        this.local = new IndexeddbPersistence(localCopyName(diagramId, generation), this.doc);
        this.local.on("synced", () => {
          this.localLoaded = true;
          this.emit();
        });
        void dropOtherGenerations(diagramId, generation);
      } catch {
        this.local = null;
      }
    }
    this.provider = new WebsocketProvider(`${wsBaseUrl()}/api/ws/diagrams`, diagramId, this.doc, {
      maxBackoffTime: 5000,
    });
    this.provider.messageHandlers[MESSAGE_PERSISTED] = (_encoder, decoder) => {
      this.persisted = Y.decodeStateVector(decoding.readVarUint8Array(decoder));
      this.persistedAt = performance.now();
      this.emit();
    };
    this.provider.on("status", ({ status }) => {
      this.connection = status === "connected" ? "online" : status === "connecting" ? "connecting" : "offline";
      this.emit();
    });
    this.provider.on("sync", (synced: boolean) => {
      this.synced = synced || this.synced;
      this.emit();
    });
    this.provider.on("closed", ({ code, reason }) => {
      this.ended = { code, reason };
      this.emit();
    });
    this.doc.on("update", (_update: Uint8Array, origin: unknown) => {
      if (origin !== this.provider) this.localChangeAt = performance.now();
      this.emit();
    });
  }

  get awareness(): Awareness {
    return this.provider.awareness;
  }

  get saveState(): SaveState {
    if (this.connection !== "online") return this.local && this.localLoaded ? "local" : "offline";
    const own = Y.getState(this.doc.store, this.doc.clientID);
    const insertsSaved = (this.persisted.get(this.doc.clientID) ?? 0) >= own;
    return insertsSaved && this.persistedAt >= this.localChangeAt ? "saved" : "saving";
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  whenReady(): Promise<void> {
    if (this.synced) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let offline = false;
      const timer = setTimeout(() => {
        offline = true;
        check();
      }, OFFLINE_START_MS);
      const check = () => {
        if (this.synced || (offline && this.localLoaded && this.elements.size > 0)) {
          finish();
          resolve();
        } else if (this.ended) {
          finish();
          reject(this.ended);
        }
      };
      const unsubscribe = this.subscribe(check);
      const finish = () => {
        clearTimeout(timer);
        unsubscribe();
      };
    });
  }

  destroy(): void {
    this.listeners.clear();
    this.provider.awareness.setLocalState(null);
    this.provider.destroy();
    void this.local?.destroy();
    this.doc.destroy();
  }
}
