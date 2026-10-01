declare module "bpmn-js-create-append-anything" {
  export const CreateAppendAnythingModule: Record<string, unknown>;
  export const CreateAppendElementTemplatesModule: Record<string, unknown>;
}
declare module "diagram-js-grid" {
  const GridModule: Record<string, unknown>;
  export default GridModule;
}
declare module "diagram-js-minimap" {
  const MinimapModule: Record<string, unknown>;
  export default MinimapModule;
}
declare module "bpmn-js-color-picker" {
  const ColorPickerModule: Record<string, unknown>;
  export default ColorPickerModule;
}
declare module "bpmn-auto-layout" {
  export function layoutProcess(xml: string): Promise<string>;
}
declare module "bpmn-js-token-simulation/lib/modeler" {
  const SimulationModule: Record<string, unknown>;
  export default SimulationModule;
}
declare module "bpmn-js-token-simulation/lib/viewer" {
  const SimulationModule: Record<string, unknown>;
  export default SimulationModule;
}
declare module "bpmn-js-differ" {
  export type Changes = {
    _added: Record<string, unknown>;
    _removed: Record<string, unknown>;
    _changed: Record<string, { model: unknown; attrs: Record<string, { oldValue: unknown; newValue: unknown }> }>;
    _layoutChanged: Record<string, unknown>;
  };
  export function diff(a: unknown, b: unknown): Changes;
}
declare module "dmn-js/lib/Modeler" {
  const DmnModeler: any;
  export default DmnModeler;
}
declare module "dmn-js/lib/Viewer" {
  const DmnViewer: any;
  export default DmnViewer;
}
