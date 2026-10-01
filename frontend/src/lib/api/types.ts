export type Role = "owner" | "admin" | "editor" | "viewer";
export type Access = "edit" | "view";

export type PublicUser = { id: string; name: string; color: string; avatarUrl: string | null };
export type User = PublicUser & { email: string | null; createdAt: string; hasPassword: boolean; isGuest: boolean };

export type Workspace = {
  id: string;
  name: string;
  role: Role;
  memberCount: number;
  projectCount: number;
  createdAt: string;
};

export type Member = { user: PublicUser & { email: string }; role: Role; joinedAt: string };

export type Invite = {
  id: string;
  token: string;
  role: Role;
  createdAt: string;
  expiresAt: string;
  createdBy: PublicUser;
};

export type InvitePreview = {
  workspace: { id: string; name: string };
  role: Role;
  invitedBy: PublicUser;
  valid: boolean;
};

export type JamSummary = {
  code: string;
  access: Access;
  host: PublicUser;
  participantCount: number;
  expiresAt: string;
};

export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  diagramCount: number;
  previewDiagramId: string | null;
  access: Access;
  role: Role | null;
  activeJam: JamSummary | null;
};

export type Folder = {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  position: string;
  createdAt: string;
  updatedAt: string;
};

export type DiagramMeta = {
  id: string;
  projectId: string;
  folderId: string | null;
  name: string;
  position: string;
  createdAt: string;
  updatedAt: string;
  contentUpdatedAt: string;
  previewUpdatedAt: string | null;
  pinnedAt: string | null;
  updatedBy: PublicUser | null;
  kind?: "bpmn" | "dmn";
};

export type Diagram = DiagramMeta & { access: Access; generation: number; publicToken?: string | null };

export type Comment = {
  id: string;
  parentId: string | null;
  elementId: string | null;
  author: PublicUser | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolvedBy: PublicUser | null;
};

export type ProcessMap = {
  diagrams: { id: string; name: string; kind: "bpmn" | "dmn"; previewUpdatedAt: string | null }[];
  links: { source: string; target: string; label: string; kind: "call" | "decision" }[];
};

export type PublicDiagram = { name: string; xml: string; projectName: string; contentUpdatedAt: string };

export type DiagramVersion = { id: string; createdAt: string; source: "auto" | "restore"; author: PublicUser | null };

export type Tree = { project: Project; folders: Folder[]; diagrams: DiagramMeta[] };

export type TrashItem = {
  kind: "folder" | "diagram";
  id: string;
  name: string;
  deletedAt: string;
  itemCount: number;
};

export type JamParticipant = { user: PublicUser; joinedAt: string; isMember: boolean };

export type Jam = {
  id: string;
  projectId: string;
  code: string;
  access: Access;
  host: PublicUser;
  createdAt: string;
  expiresAt: string;
  participants: JamParticipant[];
};

export type JamPreview = {
  code: string;
  projectName: string;
  host: PublicUser;
  participantCount: number;
  access: Access;
};

export type RecentDiagram = DiagramMeta & { projectName: string; workspaceId: string; workspaceName: string };

export type SearchResults = { projects: Project[]; diagrams: RecentDiagram[] };

export type Severity = "error" | "warning" | "info";

export type Finding = { rule: string; severity: Severity; message: string; elements: string[] };

export type CheckResult = { findings: Finding[]; elementCount: number; flowCount: number };

export type AiOp = {
  op: "add" | "insert" | "connect" | "rename" | "retype" | "remove" | "set_default" | "label_flow";
  ref?: string | null;
  type?: string | null;
  event?: string | null;
  name?: string | null;
  after?: string | null;
  attachTo?: string | null;
  interrupting?: boolean | null;
  source?: string | null;
  target?: string | null;
  element?: string | null;
  flow?: string | null;
};

export type AiIssue = {
  title: string;
  severity: Severity;
  explanation: string;
  elements: string[];
  fix: { title: string; ops: AiOp[]; resolves: string[]; sideEffects: string[] } | null;
};

export type AiImprovement = { title: string; rationale: string; ops: AiOp[]; resolves: string[]; sideEffects: string[] };

export type AiReview = {
  summary: string;
  verdict: "solid" | "needs_work" | "broken";
  issues: AiIssue[];
  improvements: AiImprovement[];
  findings: Finding[];
};

export type AiSuggestion = { title: string; ops: AiOp[]; sideEffects: string[] };

export type AiStatus = {
  available: boolean;
  reason: string | null;
  limits: Record<"review" | "chat" | "suggest" | "generate", { used: number; limit: number }>;
};

export type ChatTurn = { role: "user" | "assistant"; text: string };

export type AiCommandResult = {
  reply: string;
  title: string | null;
  ops: AiOp[];
  resolves: string[];
  sideEffects: string[];
  rejected: boolean;
};

export type AiGenerated = { name: string; xml: string; findings: Finding[]; rounds: number };
