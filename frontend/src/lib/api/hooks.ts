"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { clearLocalCopies } from "@/editor/collab/local-copy";

import { track } from "@/lib/analytics";

import { api, ApiError } from "./client";
import type {
  AiCommandResult,
  AiGenerated,
  AiReview,
  AiStatus,
  AiSuggestion,
  ChatTurn,
  CheckResult,
  Comment,
  DiagramVersion,
  ProcessMap,
  PublicDiagram,
  Access,
  Diagram,
  DiagramMeta,
  Folder,
  Invite,
  InvitePreview,
  Jam,
  JamPreview,
  Member,
  Project,
  RecentDiagram,
  Role,
  SearchResults,
  TrashItem,
  Tree,
  User,
  Workspace,
} from "./types";

export const keys = {
  me: ["me"] as const,
  workspaces: ["workspaces"] as const,
  workspace: (id: string) => ["workspace", id] as const,
  members: (id: string) => ["members", id] as const,
  invites: (id: string) => ["invites", id] as const,
  projects: (workspaceId: string) => ["projects", workspaceId] as const,
  project: (id: string) => ["project", id] as const,
  tree: (projectId: string) => ["tree", projectId] as const,
  trash: (projectId: string) => ["trash", projectId] as const,
  diagram: (id: string) => ["diagram", id] as const,
  jam: (projectId: string) => ["jam", projectId] as const,
  recent: ["recent"] as const,
  myJams: ["myJams"] as const,
  jamPreview: (code: string) => ["jamPreview", code] as const,
  invite: (token: string) => ["invite", token] as const,
  search: (workspaceId: string, q: string) => ["search", workspaceId, q] as const,
};

const noRetryOn4xx = (count: number, error: unknown) =>
  !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2;

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api<User>("/auth/me");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
  });
}

export function useProviders() {
  return useQuery({
    queryKey: ["providers"],
    queryFn: () => api<{ google: boolean }>("/auth/providers"),
    staleTime: Infinity,
  });
}

function tap<T>(event: string, params: Record<string, string | number | boolean> = {}) {
  return (value: T) => {
    track(event, params);
    return value;
  };
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => api<User>("/auth/login", { method: "POST", body }).then(tap("login", { method: "email" })),
    onSuccess: (user) => {
      qc.clear();
      qc.setQueryData(keys.me, user);
    },
  });
}

export function useSignup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string; name: string }) =>
      api<User>("/auth/signup", { method: "POST", body }).then(tap("sign_up", { method: "email" })),
    onSuccess: (user) => {
      qc.clear();
      qc.setQueryData(keys.me, user);
    },
  });
}

export function useStartGuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<User>("/auth/guest", { method: "POST" }).then(tap("guest_start")),
    onSuccess: (user) => {
      qc.setQueryData(keys.me, user);
      qc.invalidateQueries({ queryKey: keys.workspaces });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(keys.me, null);
      void clearLocalCopies();
    },
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; color?: string; currentPassword?: string; newPassword?: string }) =>
      api<User>("/auth/me", { method: "PATCH", body }),
    onSuccess: (user) => qc.setQueryData(keys.me, user),
  });
}

export function useWorkspaces(enabled = true) {
  return useQuery({ queryKey: keys.workspaces, queryFn: () => api<Workspace[]>("/workspaces"), enabled });
}

export function useWorkspace(id: string | undefined) {
  return useQuery({
    queryKey: keys.workspace(id ?? ""),
    queryFn: () => api<Workspace>(`/workspaces/${id}`),
    enabled: !!id,
    retry: noRetryOn4xx,
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api<Workspace>("/workspaces", { method: "POST", body: { name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.workspaces }),
  });
}

export function useUpdateWorkspace(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api<Workspace>(`/workspaces/${id}`, { method: "PATCH", body: { name } }),
    onSuccess: (ws) => {
      qc.setQueryData(keys.workspace(id), ws);
      qc.invalidateQueries({ queryKey: keys.workspaces });
    },
  });
}

export function useDeleteWorkspace(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/workspaces/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.workspaces }),
  });
}

export function useMembers(workspaceId: string) {
  return useQuery({ queryKey: keys.members(workspaceId), queryFn: () => api<Member[]>(`/workspaces/${workspaceId}/members`) });
}

export function useAddMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { userId: string; role?: Role }) =>
      api<Member>(`/workspaces/${workspaceId}/members`, { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.members(workspaceId) });
      qc.invalidateQueries({ queryKey: ["jam"] });
    },
  });
}

export function useUpdateMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      api<Member>(`/workspaces/${workspaceId}/members/${userId}`, { method: "PATCH", body: { role } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.members(workspaceId) }),
  });
}

export function useRemoveMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api<void>(`/workspaces/${workspaceId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.members(workspaceId) });
      qc.invalidateQueries({ queryKey: keys.workspaces });
    },
  });
}

export function useInvites(workspaceId: string, enabled = true) {
  return useQuery({
    queryKey: keys.invites(workspaceId),
    queryFn: () => api<Invite[]>(`/workspaces/${workspaceId}/invites`),
    enabled,
  });
}

export function useCreateInvite(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (role: Role) => api<Invite>(`/workspaces/${workspaceId}/invites`, { method: "POST", body: { role } }).then(tap("invite_create", { role })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invites(workspaceId) }),
  });
}

export function useRevokeInvite(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => api<void>(`/invites/${inviteId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invites(workspaceId) }),
  });
}

export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: keys.invite(token),
    queryFn: () => api<InvitePreview>(`/invites/${token}`),
    retry: noRetryOn4xx,
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api<Workspace>(`/invites/${token}/accept`, { method: "POST" }).then(tap("invite_accept")),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.workspaces }),
  });
}

export function useProjects(workspaceId: string | undefined) {
  return useQuery({
    queryKey: keys.projects(workspaceId ?? ""),
    queryFn: () => api<Project[]>(`/workspaces/${workspaceId}/projects`),
    enabled: !!workspaceId,
  });
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: keys.project(projectId ?? ""),
    queryFn: () => api<Project>(`/projects/${projectId}`),
    enabled: !!projectId,
    retry: noRetryOn4xx,
  });
}

export function useCreateProject(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api<Project>(`/workspaces/${workspaceId}/projects`, { method: "POST", body: { name } }).then(tap("project_create")),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.projects(workspaceId) });
      qc.invalidateQueries({ queryKey: keys.workspaces });
    },
  });
}

export function useUpdateProject(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; workspaceId?: string }) =>
      api<Project>(`/projects/${projectId}`, { method: "PATCH", body }),
    onSuccess: (project) => {
      qc.setQueryData(keys.project(projectId), project);
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: keys.tree(projectId) });
    },
  });
}

export function useDeleteProject(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => api<void>(`/projects/${projectId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projects(workspaceId) }),
  });
}

export function useTree(projectId: string | undefined) {
  return useQuery({
    queryKey: keys.tree(projectId ?? ""),
    queryFn: () => api<Tree>(`/projects/${projectId}/tree`),
    enabled: !!projectId,
    retry: noRetryOn4xx,
  });
}

export function useTrash(projectId: string, enabled = true) {
  return useQuery({
    queryKey: keys.trash(projectId),
    queryFn: () => api<TrashItem[]>(`/projects/${projectId}/trash`),
    enabled,
  });
}

export function invalidateTree(qc: QueryClient, projectId: string) {
  qc.invalidateQueries({ queryKey: keys.tree(projectId) });
  qc.invalidateQueries({ queryKey: keys.trash(projectId) });
  qc.invalidateQueries({ queryKey: keys.recent });
}

function useTreeMutation<TArgs, TResult>(projectId: string, fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidateTree(qc, projectId) });
}

export function useCreateFolder(projectId: string) {
  return useTreeMutation(projectId, (body: { name: string; parentId?: string | null }) =>
    api<Folder>(`/projects/${projectId}/folders`, { method: "POST", body }),
  );
}

export function useUpdateFolder(projectId: string) {
  return useTreeMutation(
    projectId,
    ({ id, ...body }: { id: string; name?: string; parentId?: string | null; position?: string }) =>
      api<Folder>(`/folders/${id}`, { method: "PATCH", body }),
  );
}

export function useDeleteFolder(projectId: string) {
  return useTreeMutation(projectId, ({ id, permanent = false }: { id: string; permanent?: boolean }) =>
    api<void>(`/folders/${id}?permanent=${permanent}`, { method: "DELETE" }),
  );
}

export function useRestoreFolder(projectId: string) {
  return useTreeMutation(projectId, (id: string) => api<Folder>(`/folders/${id}/restore`, { method: "POST" }));
}

export function useCreateDiagram(projectId: string) {
  return useTreeMutation(projectId, (body: { name?: string; folderId?: string | null; xml?: string; kind?: "bpmn" | "dmn" }) =>
    api<DiagramMeta>(`/projects/${projectId}/diagrams`, { method: "POST", body }).then(
      tap("diagram_create", { kind: body.kind ?? "bpmn", source: body.xml ? "import_or_ai" : "blank" }),
    ),
  );
}

export function useUpdateDiagram(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      folderId?: string | null;
      position?: string;
      pinned?: boolean;
    }) =>
      api<DiagramMeta>(`/diagrams/${id}`, { method: "PATCH", body }),
    onSuccess: (diagram) => {
      invalidateTree(qc, projectId);
      qc.invalidateQueries({ queryKey: keys.diagram(diagram.id) });
    },
  });
}

export function useDeleteDiagram(projectId: string) {
  return useTreeMutation(projectId, ({ id, permanent = false }: { id: string; permanent?: boolean }) =>
    api<void>(`/diagrams/${id}?permanent=${permanent}`, { method: "DELETE" }),
  );
}

export function useRestoreDiagram(projectId: string) {
  return useTreeMutation(projectId, (id: string) => api<DiagramMeta>(`/diagrams/${id}/restore`, { method: "POST" }));
}

export function useDuplicateDiagram(projectId: string) {
  return useTreeMutation(projectId, (id: string) => api<DiagramMeta>(`/diagrams/${id}/duplicate`, { method: "POST" }));
}

export function useEmptyTrash(projectId: string) {
  return useTreeMutation(projectId, () => api<void>(`/projects/${projectId}/trash`, { method: "DELETE" }));
}

export function useVersions(diagramId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["versions", diagramId],
    queryFn: () => api<DiagramVersion[]>(`/diagrams/${diagramId}/versions`),
    enabled,
    staleTime: 0,
  });
}

export async function fetchVersionXml(diagramId: string, versionId: string): Promise<string> {
  const res = await fetch(`/api/diagrams/${diagramId}/versions/${versionId}/xml`, { credentials: "same-origin" });
  if (!res.ok) throw new ApiError(res.status, "version_not_found", null);
  return res.text();
}

export function useRestoreVersion(diagramId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) =>
      api<DiagramVersion>(`/diagrams/${diagramId}/versions/${versionId}/restore`, { method: "POST" }).then(
        tap("version_restore"),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["versions", diagramId] });
      qc.invalidateQueries({ queryKey: keys.diagram(diagramId) });
    },
  });
}

export function useDiagram(diagramId: string | undefined) {
  return useQuery({
    queryKey: keys.diagram(diagramId ?? ""),
    queryFn: () => api<Diagram>(`/diagrams/${diagramId}`),
    enabled: !!diagramId,
    retry: noRetryOn4xx,
  });
}

export async function uploadPreview(diagramId: string, svg: string): Promise<void> {
  await api<void>(`/diagrams/${diagramId}/preview`, { method: "PUT", raw: svg, contentType: "image/svg+xml" });
}

export function useJam(projectId: string | undefined) {
  return useQuery({
    queryKey: keys.jam(projectId ?? ""),
    queryFn: () => api<Jam | null>(`/projects/${projectId}/jam`),
    enabled: !!projectId,
  });
}

function invalidateJam(qc: QueryClient, projectId: string) {
  qc.invalidateQueries({ queryKey: keys.jam(projectId) });
  qc.invalidateQueries({ queryKey: keys.project(projectId) });
  qc.invalidateQueries({ queryKey: ["projects"] });
}

export function useStartJam(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (access: Access) => api<Jam>(`/projects/${projectId}/jam`, { method: "POST", body: { access } }).then(tap("jam_start", { access })),
    onSuccess: () => invalidateJam(qc, projectId),
  });
}

export function useUpdateJam(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (access: Access) => api<Jam>(`/projects/${projectId}/jam`, { method: "PATCH", body: { access } }),
    onSuccess: () => invalidateJam(qc, projectId),
  });
}

export function useEndJam(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/projects/${projectId}/jam`, { method: "DELETE" }),
    onSuccess: () => invalidateJam(qc, projectId),
  });
}

export function useJamPreview(code: string) {
  return useQuery({
    queryKey: keys.jamPreview(code),
    queryFn: () => api<JamPreview>(`/jams/${encodeURIComponent(code)}`),
    retry: noRetryOn4xx,
  });
}

export function useJoinJam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      api<{ projectId: string; jam: Jam }>(`/jams/${encodeURIComponent(code)}/join`, { method: "POST" }).then(
        tap("jam_join"),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.myJams }),
  });
}

export function useRecent(limit = 12) {
  return useQuery({ queryKey: keys.recent, queryFn: () => api<RecentDiagram[]>(`/me/recent?limit=${limit}`) });
}

export function useMyJams() {
  return useQuery({ queryKey: keys.myJams, queryFn: () => api<Project[]>("/me/jams") });
}

export function useSearch(workspaceId: string, q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: keys.search(workspaceId, query),
    queryFn: () => api<SearchResults>(`/workspaces/${workspaceId}/search?q=${encodeURIComponent(query)}`),
    enabled: query.length > 0,
    staleTime: 10_000,
  });
}

export function useCheck(diagramId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["check", diagramId],
    queryFn: () => api<CheckResult>(`/diagrams/${diagramId}/check`),
    enabled,
    staleTime: 0,
  });
}

export function useAiStatus(enabled = true) {
  return useQuery({ queryKey: ["ai-status"], queryFn: () => api<AiStatus>("/ai/status"), enabled, staleTime: 30_000 });
}

export function useAiReview(diagramId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (language: string) =>
      api<AiReview>(`/diagrams/${diagramId}/ai/review`, { method: "POST", body: { language } }).then(tap("ai_review")),
    onSettled: () => qc.invalidateQueries({ queryKey: ["ai-status"] }),
  });
}

export function useAiSuggest(diagramId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ elementId, language }: { elementId: string; language: string }) =>
      api<{ suggestions: AiSuggestion[] }>(`/diagrams/${diagramId}/ai/suggest`, {
        method: "POST",
        body: { elementId, language },
      }).then(tap("ai_suggest")),
    onSettled: () => qc.invalidateQueries({ queryKey: ["ai-status"] }),
  });
}

export function useProcessMap(projectId: string) {
  return useQuery({
    queryKey: ["map", projectId],
    queryFn: () => api<ProcessMap>(`/projects/${projectId}/map`),
  });
}

export function useComments(diagramId: string) {
  return useQuery({
    queryKey: ["comments", diagramId],
    queryFn: () => api<Comment[]>(`/diagrams/${diagramId}/comments`),
  });
}

export function useCommentActions(diagramId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["comments", diagramId] });
  return {
    add: useMutation({
      mutationFn: (body: { body: string; elementId?: string | null; parentId?: string | null }) =>
        api<Comment>(`/diagrams/${diagramId}/comments`, { method: "POST", body }).then(
          tap("comment_create", { reply: !!body.parentId, on_element: !!body.elementId }),
        ),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: { id: string; body?: string; resolved?: boolean }) =>
        api<Comment>(`/comments/${id}`, { method: "PATCH", body }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<void>(`/comments/${id}`, { method: "DELETE" }),
      onSuccess: refresh,
    }),
  };
}

export function usePublicLink(diagramId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: keys.diagram(diagramId) });
  return {
    enable: useMutation({
      mutationFn: () =>
        api<{ token: string }>(`/diagrams/${diagramId}/public-link`, { method: "PUT" }).then(tap("public_link_create")),
      onSuccess: refresh,
    }),
    disable: useMutation({
      mutationFn: () => api<void>(`/diagrams/${diagramId}/public-link`, { method: "DELETE" }),
      onSuccess: refresh,
    }),
  };
}

export function usePublicDiagram(token: string) {
  return useQuery({
    queryKey: ["public", token],
    queryFn: () => api<PublicDiagram>(`/public/${token}`),
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useAiCommand(diagramId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messages, selection, language }: { messages: ChatTurn[]; selection: string[]; language: string }) =>
      api<AiCommandResult>(`/diagrams/${diagramId}/ai/command`, {
        method: "POST",
        body: { messages, selection, language },
      }).then((result) => {
        track("ai_command", { applied: result.ops.length > 0, rejected: result.rejected, selection: selection.length });
        return result;
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["ai-status"] }),
  });
}

export function useAiGenerate(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ description, language }: { description: string; language: string }) =>
      api<AiGenerated>(`/projects/${projectId}/ai/generate`, { method: "POST", body: { description, language } }).then(
        tap("ai_generate"),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: ["ai-status"] }),
  });
}
