"use client";

import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";

import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

import { RemoteCursor, type PresenceUser } from "@/components/editor-chrome/presence";

type Insets = { top: number; right: number; bottom: number; left: number };

export type MockPresence = {
  selections: { elementId: string; user: PresenceUser | null }[];
  cursors: { elementId: string; dx: number; dy: number; user: PresenceUser }[];
};

export function MockCanvas({ src, insets, presence }: { src: string; insets: Insets; presence: MockPresence }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let destroyed = false;
    let viewer: { destroy(): void; get(name: string): any; importXML(xml: string): Promise<unknown> } | undefined;
    const roots: { unmount(): void }[] = [];

    (async () => {
      const [{ default: NavigatedViewer }, xml] = await Promise.all([
        import("bpmn-js/lib/NavigatedViewer"),
        fetch(src).then((r) => r.text()),
      ]);
      if (destroyed || !ref.current) return;
      viewer = new NavigatedViewer({ container: ref.current, bpmnRenderer: { defaultStrokeColor: "#18181b" } });
      await viewer.importXML(xml);
      if (destroyed) return;

      const canvas = viewer.get("canvas");
      const overlays = viewer.get("overlays");
      const registry = viewer.get("elementRegistry");

      canvas.zoom("fit-viewport");
      const { inner, outer } = canvas.viewbox();
      const scale = Math.min(
        (outer.width - insets.left - insets.right) / inner.width,
        (outer.height - insets.top - insets.bottom) / inner.height,
        1.1,
      );
      const freeW = outer.width - insets.left - insets.right;
      const freeH = outer.height - insets.top - insets.bottom;
      canvas.viewbox({
        x: inner.x - (insets.left + (freeW - inner.width * scale) / 2) / scale,
        y: inner.y - (insets.top + (freeH - inner.height * scale) / 2) / scale,
        width: outer.width / scale,
        height: outer.height / scale,
      });

      for (const { elementId, user } of presence.selections) {
        const el = registry.get(elementId);
        if (!el) continue;
        const color = user?.color ?? "var(--cobalt)";
        const host = document.createElement("div");
        host.style.cssText = `width:${el.width + 12}px;height:${el.height + 12}px;border:2px solid ${color};border-radius:12px;pointer-events:none;position:relative;`;
        if (user) {
          const tag = document.createElement("span");
          tag.textContent = user.name;
          tag.style.cssText = `position:absolute;left:-2px;top:-22px;background:${color};color:#fff;font:500 11px/16px var(--font-onest),sans-serif;padding:1px 7px;border-radius:999px;white-space:nowrap;`;
          host.appendChild(tag);
        }
        overlays.add(elementId, { position: { top: -6, left: -6 }, html: host, scale: true });
      }

      for (const { elementId, dx, dy, user } of presence.cursors) {
        if (!registry.get(elementId)) continue;
        const host = document.createElement("div");
        const root = createRoot(host);
        root.render(<RemoteCursor user={user} />);
        roots.push(root);
        overlays.add(elementId, { position: { top: dy, left: dx }, html: host });
      }
    })();

    return () => {
      destroyed = true;
      setTimeout(() => roots.forEach((r) => r.unmount()), 0);
      viewer?.destroy();
    };
  }, [src, insets, presence]);

  return <div ref={ref} className="mock-canvas absolute inset-0" />;
}
