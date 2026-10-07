"use client";

import { cn } from "@/lib/utils";
import { inputLabel, type Decision } from "@/lib/dmn";

const HIT_POLICY: Record<string, string> = {
  UNIQUE: "Unique",
  FIRST: "First",
  PRIORITY: "Priority",
  ANY: "Any",
  COLLECT: "Collect",
  "RULE ORDER": "Rule order",
  "OUTPUT ORDER": "Output order",
};

function cell(value: string): string {
  const trimmed = value.trim();
  return trimmed === "" || trimmed === "-" ? "–" : trimmed;
}

export function DecisionTableView({
  decision,
  highlight = [],
  compact = false,
  className,
}: {
  decision: Decision;
  highlight?: number[];
  compact?: boolean;
  className?: string;
}) {
  if (decision.kind === "literal") {
    return (
      <div className={cn("rounded-2xl border border-hairline p-3", className)}>
        <p className="text-[12px] font-medium text-slate">{decision.name || "Decision"} · literal expression</p>
        <pre className="mt-1 whitespace-pre-wrap font-mono text-[13px]">{decision.literal || "–"}</pre>
      </div>
    );
  }
  if (decision.kind !== "table") {
    return (
      <p className={cn("rounded-2xl border border-hairline p-3 text-[13px] text-slate", className)}>
        {decision.name || "This decision"} uses an expression this view can&apos;t show. Open the table file to see it.
      </p>
    );
  }
  const pad = compact ? "px-2 py-1" : "px-2.5 py-1.5";
  return (
    <div className={cn("overflow-x-auto rounded-2xl border border-hairline", className)}>
      <table className={cn("w-full border-collapse text-left", compact ? "text-[12px]" : "text-[13px]")}>
        <thead>
          <tr className="bg-fog">
            <th className={cn(pad, "w-8 border-b border-r border-hairline text-center font-medium text-slate")}>
              {HIT_POLICY[decision.hitPolicy.toUpperCase()]?.[0] ?? "U"}
            </th>
            {decision.inputs.map((input, i) => (
              <th
                key={input.id || i}
                className={cn(pad, "border-b border-hairline font-semibold", i === decision.inputs.length - 1 && "border-r-2 border-r-ink/20")}
              >
                <span className="block text-[10px] font-medium uppercase tracking-wide text-slate">{i === 0 ? "When" : "And"}</span>
                {inputLabel(input)}
                {input.typeRef && <span className="ml-1 font-normal text-slate">{input.typeRef}</span>}
              </th>
            ))}
            {decision.outputs.map((output, i) => (
              <th key={output.id || i} className={cn(pad, "border-b border-hairline font-semibold")}>
                <span className="block text-[10px] font-medium uppercase tracking-wide text-slate">{i === 0 ? "Then" : "And"}</span>
                {output.label || output.name || "Result"}
                {output.typeRef && <span className="ml-1 font-normal text-slate">{output.typeRef}</span>}
              </th>
            ))}
            {decision.rules.some((r) => r.description) && (
              <th className={cn(pad, "border-b border-l border-hairline font-medium text-slate")}>Notes</th>
            )}
          </tr>
        </thead>
        <tbody>
          {decision.rules.map((rule, index) => {
            const hit = highlight.includes(index);
            return (
              <tr key={rule.id || index} className={cn(hit ? "bg-[#30a46c]/12" : index % 2 ? "bg-paper" : "bg-fog/40")}>
                <td className={cn(pad, "border-r border-t border-hairline text-center tabular-nums", hit ? "font-semibold text-[#1d6b44]" : "text-slate")}>
                  {index + 1}
                </td>
                {decision.inputs.map((input, i) => (
                  <td
                    key={input.id || i}
                    className={cn(pad, "border-t border-hairline font-mono", i === decision.inputs.length - 1 && "border-r-2 border-r-ink/20")}
                  >
                    {cell(rule.inputs[i] ?? "")}
                  </td>
                ))}
                {decision.outputs.map((output, i) => (
                  <td key={output.id || i} className={cn(pad, "border-t border-hairline font-mono", hit && "font-semibold")}>
                    {cell(rule.outputs[i] ?? "")}
                  </td>
                ))}
                {decision.rules.some((r) => r.description) && (
                  <td className={cn(pad, "border-l border-t border-hairline text-slate")}>{rule.description}</td>
                )}
              </tr>
            );
          })}
          {decision.rules.length === 0 && (
            <tr>
              <td colSpan={decision.inputs.length + decision.outputs.length + 1} className={cn(pad, "border-t border-hairline text-slate")}>
                No rules yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="border-t border-hairline px-2.5 py-1 text-[11px] text-slate">
        Hit policy: {HIT_POLICY[decision.hitPolicy.toUpperCase()] ?? decision.hitPolicy}
      </p>
    </div>
  );
}
