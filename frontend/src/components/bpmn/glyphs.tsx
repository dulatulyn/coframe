import type { SVGProps } from "react";

export type GlyphKind =
  | "start"
  | "start-message"
  | "start-timer"
  | "start-signal"
  | "start-conditional"
  | "intermediate"
  | "intermediate-message-catch"
  | "intermediate-message-throw"
  | "intermediate-timer"
  | "intermediate-signal-throw"
  | "intermediate-link-catch"
  | "end"
  | "end-message"
  | "end-error"
  | "end-terminate"
  | "end-escalation"
  | "gateway-exclusive"
  | "gateway-parallel"
  | "gateway-inclusive"
  | "gateway-event"
  | "gateway-complex"
  | "task"
  | "task-user"
  | "task-service"
  | "task-send"
  | "task-receive"
  | "task-manual"
  | "task-business-rule"
  | "task-script"
  | "call-activity"
  | "subprocess-collapsed"
  | "subprocess-expanded"
  | "event-subprocess"
  | "transaction"
  | "data-object"
  | "data-store"
  | "pool"
  | "lane"
  | "group"
  | "text-annotation"
  | "sequence-flow"
  | "message-flow"
  | "association";

type Props = SVGProps<SVGSVGElement> & { kind: GlyphKind; size?: number };

export function Glyph({ kind, size = 20, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {GLYPHS[kind]}
    </svg>
  );
}

const ring = <circle cx="12" cy="12" r="8.25" />;
const doubleRing = (
  <>
    <circle cx="12" cy="12" r="8.5" strokeWidth="1.2" />
    <circle cx="12" cy="12" r="6.6" strokeWidth="1.2" />
  </>
);
const thickRing = <circle cx="12" cy="12" r="8" strokeWidth="2.75" />;
const envelope = (filled: boolean) => (
  <>
    <rect x="8.6" y="9.6" width="6.8" height="4.8" rx="0.6" fill={filled ? "currentColor" : "none"} strokeWidth="1.1" />
    <path d="M8.8 10l3.2 2.3 3.2-2.3" strokeWidth="1.1" stroke={filled ? "var(--paper, #fff)" : "currentColor"} />
  </>
);
const clock = (
  <>
    <circle cx="12" cy="12" r="4.4" strokeWidth="1.1" />
    <path d="M12 9.6V12l1.6 1" strokeWidth="1.1" />
  </>
);
const diamond = <path d="M12 2.6 21.4 12 12 21.4 2.6 12Z" />;
const taskBox = <rect x="2.5" y="5.25" width="19" height="13.5" rx="3" />;
const taskWith = (marker: React.ReactNode) => (
  <>
    <rect x="2.5" y="5.25" width="19" height="13.5" rx="3" strokeWidth="1.25" />
    <g transform="translate(12 12) scale(1.3)" strokeWidth="0.95">
      {marker}
    </g>
  </>
);

const GLYPHS: Record<GlyphKind, React.ReactNode> = {
  start: ring,
  "start-message": (
    <>
      {ring}
      {envelope(false)}
    </>
  ),
  "start-timer": (
    <>
      {ring}
      {clock}
    </>
  ),
  "start-signal": (
    <>
      {ring}
      <path d="M12 8.8l3.3 5.7H8.7Z" strokeWidth="1.1" />
    </>
  ),
  "start-conditional": (
    <>
      {ring}
      <rect x="9.3" y="8.6" width="5.4" height="6.8" rx="0.4" strokeWidth="1.1" />
      <path d="M10.4 10.4h3.2M10.4 12h3.2M10.4 13.6h3.2" strokeWidth="0.9" />
    </>
  ),
  intermediate: doubleRing,
  "intermediate-message-catch": (
    <>
      {doubleRing}
      {envelope(false)}
    </>
  ),
  "intermediate-message-throw": (
    <>
      {doubleRing}
      {envelope(true)}
    </>
  ),
  "intermediate-timer": (
    <>
      {doubleRing}
      {clock}
    </>
  ),
  "intermediate-signal-throw": (
    <>
      {doubleRing}
      <path d="M12 8.8l3.3 5.7H8.7Z" fill="currentColor" strokeWidth="1.1" />
    </>
  ),
  "intermediate-link-catch": (
    <>
      {doubleRing}
      <path d="M8.8 10.8h3.6V9.3L15.4 12l-3 2.7v-1.5H8.8Z" strokeWidth="1.1" />
    </>
  ),
  end: thickRing,
  "end-message": (
    <>
      {thickRing}
      {envelope(true)}
    </>
  ),
  "end-error": (
    <>
      {thickRing}
      <path d="M9 15.2l1.6-5.6 2.2 3 2.2-3.8-1 6.1-2.1-2.9Z" fill="currentColor" strokeWidth="0.9" />
    </>
  ),
  "end-terminate": (
    <>
      {thickRing}
      <circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none" />
    </>
  ),
  "end-escalation": (
    <>
      {thickRing}
      <path d="M12 8.4l2.8 6.6L12 13.2 9.2 15Z" fill="currentColor" strokeWidth="1" />
    </>
  ),
  "gateway-exclusive": (
    <>
      {diamond}
      <path d="M9.4 9.4l5.2 5.2M14.6 9.4l-5.2 5.2" strokeWidth="2" />
    </>
  ),
  "gateway-parallel": (
    <>
      {diamond}
      <path d="M12 8.2v7.6M8.2 12h7.6" strokeWidth="2" />
    </>
  ),
  "gateway-inclusive": (
    <>
      {diamond}
      <circle cx="12" cy="12" r="3.5" strokeWidth="1.7" />
    </>
  ),
  "gateway-event": (
    <>
      {diamond}
      <circle cx="12" cy="12" r="4.6" strokeWidth="1" />
      <path d="M12 9.8l2.1 1.5-.8 2.5h-2.6l-.8-2.5Z" strokeWidth="1" />
    </>
  ),
  "gateway-complex": (
    <>
      {diamond}
      <path d="M12 8.2v7.6M8.2 12h7.6M9.3 9.3l5.4 5.4M14.7 9.3l-5.4 5.4" strokeWidth="1.6" />
    </>
  ),
  task: taskBox,
  "task-user": taskWith(
    <>
      <circle cx="0" cy="-1.7" r="1.5" />
      <path d="M-3 3c.5-2 1.6-2.9 3-2.9s2.5.9 3 2.9" />
    </>,
  ),
  "task-service": taskWith(
    <>
      <circle cx="0" cy="0" r="1.35" />
      <path d="M0-3.4v1.1M0 2.3v1.1M-3.4 0h1.1M2.3 0h1.1M-2.4-2.4l.8.8M1.6 1.6l.8.8M-2.4 2.4l.8-.8M1.6-1.6l.8-.8" />
    </>,
  ),
  "task-send": taskWith(
    <>
      <rect x="-3.3" y="-2.3" width="6.6" height="4.6" rx="0.5" fill="currentColor" />
      <path d="M-3-1.9 0 .3l3-2.2" stroke="var(--paper, #fff)" />
    </>,
  ),
  "task-receive": taskWith(
    <>
      <rect x="-3.3" y="-2.3" width="6.6" height="4.6" rx="0.5" />
      <path d="M-3-1.9 0 .3l3-2.2" />
    </>,
  ),
  "task-manual": taskWith(<path d="M-3.2 2.6V-.2l1.7-2.3h4.4M-1.6-.8h4.2M-1.4.9h3.8M-2.3 2.6h4.3" />),
  "task-business-rule": taskWith(
    <>
      <rect x="-3.3" y="-2.5" width="6.6" height="5" rx="0.4" />
      <path d="M-3.3-.9h6.6M-1.2-.9v3.4" />
    </>,
  ),
  "task-script": taskWith(
    <path d="M-2.3-3h4.9c-1.1 1-1.1 2 0 3s1.1 2 0 3h-4.9c1.1-1 1.1-2 0-3s-1.1-2 0-3ZM-1.4-1.3h2.7M-1.4.6h2.7" />,
  ),
  "call-activity": <rect x="2.5" y="5.25" width="19" height="13.5" rx="3" strokeWidth="2.6" />,
  "subprocess-collapsed": (
    <>
      {taskBox}
      <rect x="10" y="13.4" width="4" height="4" rx="0.4" strokeWidth="1" />
      <path d="M12 14.2v2.4M10.8 15.4h2.4" strokeWidth="1" />
    </>
  ),
  "subprocess-expanded": (
    <>
      <rect x="2" y="3.5" width="20" height="17" rx="3" />
      <circle cx="7.2" cy="12" r="1.8" strokeWidth="1.1" />
      <circle cx="16.8" cy="12" r="1.8" strokeWidth="2" />
      <path d="M9 12h5.6" strokeWidth="1" />
    </>
  ),
  "event-subprocess": <rect x="2.5" y="5.25" width="19" height="13.5" rx="3" strokeDasharray="1.6 1.8" />,
  transaction: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="3" />
      <rect x="4.4" y="6.9" width="15.2" height="10.2" rx="1.8" strokeWidth="1.1" />
    </>
  ),
  "data-object": (
    <>
      <path d="M6.5 3.25h7.25l3.75 3.75v13.75h-11Z" />
      <path d="M13.75 3.25V7h3.75" />
    </>
  ),
  "data-store": (
    <>
      <ellipse cx="12" cy="6" rx="7.5" ry="2.5" />
      <path d="M4.5 6v12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5V6" />
      <path d="M4.5 9c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5M4.5 11.8c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5" strokeWidth="1.1" />
    </>
  ),
  pool: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="1.5" />
      <path d="M6.5 5v14" />
    </>
  ),
  lane: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="1.5" />
      <path d="M6.5 4v16M6.5 12H22" />
    </>
  ),
  group: <rect x="2.5" y="4.5" width="19" height="15" rx="3" strokeDasharray="4 1.6 0.6 1.6" />,
  "text-annotation": (
    <>
      <path d="M9 4.5H5.5v15H9" />
      <path d="M11.5 9.5h7M11.5 12.5h7M11.5 15.5h4.5" strokeWidth="1.2" />
    </>
  ),
  "sequence-flow": (
    <>
      <path d="M3 12h14.5" />
      <path d="M16.2 8.8 20.6 12l-4.4 3.2Z" fill="currentColor" />
    </>
  ),
  "message-flow": (
    <>
      <circle cx="4.6" cy="12" r="1.8" />
      <path d="M6.4 12h11" strokeDasharray="2.2 1.8" />
      <path d="M16.4 8.8 20.6 12l-4.2 3.2Z" />
    </>
  ),
  association: <path d="M3 12h18" strokeDasharray="0.1 2.6" strokeWidth="1.8" />,
};
