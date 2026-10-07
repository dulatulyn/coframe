import { DECISION_CREATE_EVENT, DECISION_OPEN_EVENT, isRuleTask, linkedDecisionId } from "./link";

type Element = any;

const ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#18181b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/></svg>',
  );

class DecisionPadProvider {
  static $inject = ["contextPad", "eventBus"];

  constructor(
    contextPad: { registerProvider(priority: number, provider: unknown): void },
    private eventBus: { fire(type: string, data: unknown): void },
  ) {
    contextPad.registerProvider(395, this);
  }

  getContextPadEntries(element: Element) {
    if (!isRuleTask(element)) return {};
    const linked = !!linkedDecisionId(element);
    return {
      "coframe-decision": {
        group: "coframe",
        imageUrl: ICON,
        title: linked ? "Open the decision table" : "Create a decision table",
        action: {
          click: (_event: Event, target: Element) =>
            this.eventBus.fire(linked ? DECISION_OPEN_EVENT : DECISION_CREATE_EVENT, { element: target }),
        },
      },
    };
  }
}

export const DecisionPadModule = {
  __init__: ["coframeDecisionPad"],
  coframeDecisionPad: ["type", DecisionPadProvider],
};
