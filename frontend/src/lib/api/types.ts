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
};

export type Diagram = DiagramMeta & { access: Access };

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
