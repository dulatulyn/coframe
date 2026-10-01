export const COFRAME_MODDLE = {
  name: "Coframe",
  prefix: "coframe",
  uri: "https://coframe.run/schema/bpmn/1.0",
  xml: { tagAlias: "lowerCase" },
  associations: [],
  types: [
    {
      name: "Analysis",
      extends: ["bpmn:FlowNode"],
      properties: [
        { name: "duration", isAttr: true, type: "String" },
        { name: "cost", isAttr: true, type: "String" },
        { name: "raci", isAttr: true, type: "String" },
        { name: "probability", isAttr: true, type: "String" },
      ],
    },
    {
      name: "Branch",
      extends: ["bpmn:SequenceFlow"],
      properties: [{ name: "probability", isAttr: true, type: "String" }],
    },
    {
      name: "Link",
      extends: ["bpmn:CallActivity", "bpmn:BusinessRuleTask"],
      properties: [{ name: "diagram", isAttr: true, type: "String" }],
    },
  ],
};
