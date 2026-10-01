import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

const GROUPS: { title: string; items: [string, string[]][] }[] = [
  {
    title: "Tools",
    items: [
      ["Hand tool", ["H"]],
      ["Lasso tool", ["L"]],
      ["Create/remove space", ["S"]],
      ["Global connect", ["C"]],
      ["Create element", ["N"]],
      ["Append element", ["A"]],
      ["Change element type", ["R"]],
      ["Edit label", ["E"]],
    ],
  },
  {
    title: "Editing",
    items: [
      ["Undo", [mod, "Z"]],
      ["Redo", [mod, "⇧", "Z"]],
      ["Copy / paste", [mod, "C", "/", mod, "V"]],
      ["Select all", [mod, "A"]],
      ["Delete", ["⌫"]],
      ["Move selection", ["←↑→↓"]],
      ["Move faster", ["⇧", "←↑→↓"]],
      ["Find element", [mod, "F"]],
    ],
  },
  {
    title: "View",
    items: [
      ["Zoom in / out", [mod, "+", "/", mod, "−"]],
      ["Zoom to 100%", [mod, "0"]],
      ["Scroll", ["Wheel"]],
      ["Scroll sideways", ["⇧", "Wheel"]],
      ["Zoom with wheel", [mod, "Wheel"]],
      ["This sheet", ["?"]],
    ],
  },
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Click the canvas first so it receives the keys.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-3">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-2 text-[12px] text-slate">{group.title}</div>
              <div className="flex flex-col gap-1.5">
                {group.items.map(([label, keys]) => (
                  <div key={label} className="flex items-center justify-between gap-3 text-[14px]">
                    <span>{label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {keys.map((k, i) =>
                        k === "/" ? (
                          <span key={i} className="text-[12px] text-slate">
                            /
                          </span>
                        ) : (
                          <span key={i} className="keycap">
                            {k}
                          </span>
                        ),
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
