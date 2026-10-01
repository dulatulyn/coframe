import { ArrowLeftRight, Copy, X } from "lucide-react";

import { Glyph, type GlyphKind } from "@/components/bpmn/glyphs";
import { cn } from "@/lib/utils";

const FILLS = ["#ffffff", "#bbdefb", "#ffe0b2", "#c8e6c9", "#ffcdd2", "#e1bee7"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] text-slate">{label}</span>
      {children}
    </div>
  );
}

export function Inspector({
  typeLabel,
  glyph,
  name,
  documentation,
  elementId,
  onClose,
  className,
}: {
  typeLabel: string;
  glyph: GlyphKind;
  name: string;
  documentation?: string;
  elementId: string;
  onClose?: () => void;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col", className)}>
      <header className="flex items-start gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-hairline bg-paper">
          <Glyph kind={glyph} size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-slate">{typeLabel}</div>
          <div className="truncate text-[15px] font-semibold tracking-tight">{name}</div>
        </div>
        <button
          type="button"
          aria-label="Close inspector"
          onClick={onClose}
          className="grid size-8 place-items-center rounded-full text-slate hover:bg-fog hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex flex-col gap-4 px-4 pb-4">
        <Field label="Name">
          <input
            defaultValue={name}
            className="h-10 rounded-xl bg-fog px-3 text-[14px] outline-none focus:bg-paper focus:ring-2 focus:ring-cobalt"
          />
        </Field>

        <Field label="Type">
          <button
            type="button"
            className="flex h-10 items-center gap-2.5 rounded-xl border border-hairline px-3 text-left text-[14px] hover:bg-fog"
          >
            <Glyph kind={glyph} size={18} />
            <span className="flex-1">{typeLabel}</span>
            <ArrowLeftRight className="size-4 text-slate" />
          </button>
        </Field>

        <Field label="Markers">
          <div className="grid grid-cols-4 rounded-xl bg-fog p-1 text-[12px] font-medium">
            {["None", "Loop", "Parallel", "Sequential"].map((m, i) => (
              <span
                key={m}
                className={cn("rounded-lg py-1.5 text-center", i === 0 ? "bg-paper shadow-sm" : "text-slate")}
              >
                {m}
              </span>
            ))}
          </div>
        </Field>

        <Field label="Documentation">
          <textarea
            defaultValue={documentation}
            rows={3}
            className="resize-none rounded-xl bg-fog px-3 py-2 text-[14px] leading-5 outline-none focus:bg-paper focus:ring-2 focus:ring-cobalt"
          />
        </Field>

        <Field label="Color">
          <div className="flex gap-2">
            {FILLS.map((fill, i) => (
              <button
                key={fill}
                type="button"
                aria-label={`Fill ${fill}`}
                className={cn(
                  "size-7 rounded-full border border-hairline",
                  i === 0 && "ring-2 ring-ink ring-offset-2",
                )}
                style={{ background: fill }}
              />
            ))}
          </div>
        </Field>
      </div>

      <footer className="mt-auto flex items-center justify-between border-t border-hairline px-4 py-3">
        <span className="font-mono text-[12px] text-slate">{elementId}</span>
        <button type="button" aria-label="Copy ID" className="grid size-7 place-items-center rounded-full text-slate hover:bg-fog">
          <Copy className="size-3.5" />
        </button>
      </footer>
    </section>
  );
}
