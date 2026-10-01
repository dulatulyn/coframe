import { Clock, GitBranch, Pencil, Play, Presentation, Users, type LucideIcon } from "lucide-react";

export type ViewMode = "edit" | "simulate" | "paths" | "roles" | "metrics" | "present";

export const BANNERS: Partial<Record<ViewMode, string>> = {
  simulate: "Press ▶ on a start event. At a decision, pick the branch the token takes.",
  paths: "Pick a path to highlight it on the diagram.",
  roles: "Responsibilities come from lanes and pools.",
  metrics: "Set durations, costs and branch odds on the right.",
  present: "Use ← → or Space to move between steps.",
};

export const VIEWS: { id: ViewMode; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "edit", label: "Edit", hint: "Model the process", icon: Pencil },
  { id: "simulate", label: "Simulate", hint: "Run tokens through the process", icon: Play },
  { id: "paths", label: "Paths", hint: "Every route from start to end", icon: GitBranch },
  { id: "roles", label: "Roles", hint: "Who does what", icon: Users },
  { id: "metrics", label: "Time & cost", hint: "Durations, costs and the critical path", icon: Clock },
  { id: "present", label: "Present", hint: "Walk through the process step by step", icon: Presentation },
];

export function viewInfo(mode: ViewMode) {
  return VIEWS.find((v) => v.id === mode) ?? VIEWS[0];
}
