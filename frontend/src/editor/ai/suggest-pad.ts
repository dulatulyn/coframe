export const SUGGEST_EVENT = "coframe.suggest";

const ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#18181b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
  );

const SUGGESTABLE = /^bpmn:(Task|UserTask|ServiceTask|SendTask|ReceiveTask|ManualTask|BusinessRuleTask|ScriptTask|CallActivity|SubProcess|StartEvent|IntermediateCatchEvent|IntermediateThrowEvent|BoundaryEvent|ExclusiveGateway|ParallelGateway|InclusiveGateway|EventBasedGateway)$/;

class SuggestPadProvider {
  static $inject = ["contextPad", "eventBus"];

  constructor(
    contextPad: { registerProvider(priority: number, provider: unknown): void },
    private eventBus: { fire(type: string, data: unknown): void },
  ) {
    contextPad.registerProvider(400, this);
  }

  getContextPadEntries(element: { type: string; businessObject?: { isExpanded?: boolean } }) {
    if (!SUGGESTABLE.test(element.type)) return {};
    return {
      "coframe-suggest": {
        group: "coframe",
        imageUrl: ICON,
        title: "Suggest the next step",
        action: { click: (_event: Event, target: unknown) => this.eventBus.fire(SUGGEST_EVENT, { element: target }) },
      },
    };
  }
}

export const SuggestPadModule = {
  __init__: ["coframeSuggestPad"],
  coframeSuggestPad: ["type", SuggestPadProvider],
};
