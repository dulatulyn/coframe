import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css";
import "bpmn-js-color-picker/colors/color-picker.css";
import "diagram-js-minimap/assets/diagram-js-minimap.css";
import "bpmn-js-token-simulation/assets/css/bpmn-js-token-simulation.css";
import "./editor.css";

import type Modeler from "bpmn-js/lib/Modeler";

import { COFRAME_MODDLE } from "./coframe-moddle";
import type NavigatedViewer from "bpmn-js/lib/NavigatedViewer";

export type BpmnEditor = Modeler | NavigatedViewer;

const renderer = { defaultStrokeColor: "#18181b", defaultLabelColor: "#18181b" };

export async function createEditor(container: HTMLElement, { readOnly }: { readOnly: boolean }): Promise<BpmnEditor> {
  if (readOnly) {
    const [{ default: NavigatedViewer }, { default: GridModule }, { default: SimulationModule }] = await Promise.all([
      import("bpmn-js/lib/NavigatedViewer"),
      import("diagram-js-grid"),
      import("bpmn-js-token-simulation/lib/viewer"),
    ]);
    return new NavigatedViewer({
      container,
      bpmnRenderer: renderer,
      additionalModules: [GridModule, SimulationModule],
      moddleExtensions: { coframe: COFRAME_MODDLE },
    });
  }
  const [{ default: Modeler }, { CreateAppendAnythingModule }, { default: GridModule }, { default: MinimapModule }, { default: ColorPickerModule }] =
    await Promise.all([
      import("bpmn-js/lib/Modeler"),
      import("bpmn-js-create-append-anything"),
      import("diagram-js-grid"),
      import("diagram-js-minimap"),
      import("bpmn-js-color-picker"),
    ]);
  const [{ SuggestPadModule }, { default: SimulationModule }] = await Promise.all([
    import("./ai/suggest-pad"),
    import("bpmn-js-token-simulation/lib/modeler"),
  ]);
  return new Modeler({
    container,
    bpmnRenderer: renderer,
    minimap: { open: false },
    moddleExtensions: { coframe: COFRAME_MODDLE },
    additionalModules: [
      CreateAppendAnythingModule,
      GridModule,
      MinimapModule,
      ColorPickerModule,
      SuggestPadModule,
      SimulationModule,
    ],
  });
}

export function service<T = any>(editor: BpmnEditor, name: string): T {
  return editor.get(name) as T;
}

export function hasService(editor: BpmnEditor, name: string): boolean {
  try {
    editor.get(name);
    return true;
  } catch {
    return false;
  }
}
