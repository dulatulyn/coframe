import type { MockFile, MockFolder } from "@/components/editor-chrome/files-panel";
import type { PresenceUser } from "@/components/editor-chrome/presence";

import type { MockPresence } from "./mock-canvas";

export const ME: PresenceUser = { id: "me", name: "Nurasyl D", color: "#0090FF" };
export const AIGERIM: PresenceUser = { id: "u2", name: "Aigerim", color: "#8E4EC6" };
export const TIMUR: PresenceUser = { id: "u3", name: "Timur", color: "#30A46C" };
export const DANA: PresenceUser = { id: "u4", name: "Dana K", color: "#F76B15" };

export const PEOPLE = [ME, AIGERIM, TIMUR, DANA];

export const FOLDERS: MockFolder[] = [
  { id: "f1", name: "Sales", count: 4 },
  { id: "f2", name: "Finance", count: 7 },
  { id: "f3", name: "Onboarding", count: 3 },
  { id: "f4", name: "Archive", count: 12 },
];

export const FILES: MockFile[] = [
  { id: "d1", name: "Order to cash", updated: "Edited just now", people: [AIGERIM, TIMUR], variant: 0 },
  { id: "d2", name: "Invoice approval", updated: "Updated 2 hours ago", variant: 1 },
  { id: "d3", name: "Refund request", updated: "Updated yesterday", people: [DANA], variant: 2 },
  { id: "d4", name: "Vendor onboarding", updated: "Updated 3 days ago", variant: 3 },
  { id: "d5", name: "Complaint handling", updated: "Updated 5 days ago", variant: 1 },
];

export const PRESENCE: MockPresence = {
  selections: [
    { elementId: "Task_check", user: null },
    { elementId: "Task_invoice", user: AIGERIM },
  ],
  cursors: [
    { elementId: "Task_invoice", dx: 104, dy: 62, user: AIGERIM },
    { elementId: "Gateway_ok", dx: 58, dy: -26, user: TIMUR },
  ],
};
