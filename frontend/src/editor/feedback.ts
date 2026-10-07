const MESSAGES: Record<string, string> = {
  "flow elements must be children of pools/participants":
    "This diagram has pools, so every step goes inside one. Drop it onto a pool.",
  "Data object must be placed within a pool/participant.":
    "This diagram has pools, so data objects go inside one. Drop it onto a pool.",
};

function translate(template: string, replacements?: Record<string, string>): string {
  const text = MESSAGES[template] ?? template;
  return text.replace(/{([^}]+)}/g, (_, key) => replacements?.[key] ?? `{${key}}`);
}

type Element = any;

const HINT = "coframe-pool-hint";

class PoolHint {
  static $inject = ["eventBus", "canvas", "elementRegistry"];

  constructor(
    eventBus: { on(events: string[], callback: (event: { context: { target: Element } }) => void): void },
    canvas: { addMarker(element: Element, marker: string): void; removeMarker(element: Element, marker: string): void },
    registry: { filter(fn: (e: Element) => boolean): Element[] },
  ) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    eventBus.on(["shape.move.rejected", "create.rejected"], ({ context }) => {
      if (context?.target?.type !== "bpmn:Collaboration") return;
      const pools = registry.filter((e) => e.type === "bpmn:Participant");
      pools.forEach((pool) => canvas.addMarker(pool, HINT));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => pools.forEach((pool) => canvas.removeMarker(pool, HINT)), 1600);
    });
  }
}

export const FeedbackModule = {
  __init__: ["coframePoolHint"],
  coframePoolHint: ["type", PoolHint],
  translate: ["value", translate],
};
