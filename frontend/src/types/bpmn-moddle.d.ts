declare module "bpmn-moddle" {
  export class BpmnModdle {
    constructor(packages?: Record<string, unknown>);
    fromXML(
      xml: string,
      typeName?: string,
    ): Promise<{ rootElement: unknown; warnings: { message: string }[]; references: unknown[] }>;
    toXML(element: unknown, options?: { format?: boolean }): Promise<{ xml: string }>;
  }
}
