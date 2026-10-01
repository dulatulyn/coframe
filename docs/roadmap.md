# Coframe roadmap


**Goal:** A collaborative BPMN editor with demo.bpmn.io-level interaction, accounts, workspaces, projects with folders/files, autosave and jams by code/link.

**Architecture:** Next.js 16 (client-side editor on bpmn-js) + FastAPI + PostgreSQL. Diagram content syncs through Yjs (`y-websocket` in the browser, our own protocol handler on `pycrdt` inside FastAPI); structure (workspaces/projects/folders/permissions) goes through REST. BPMN XML is split into a flat `id → entry` model, identically in TypeScript and Python.

**Tech Stack:** Next.js 16.3, React 19.2, TypeScript, Tailwind 4, shadcn/ui, TanStack Query 5, Zustand 5, bpmn-js 18.30 (+ bpmn-js-create-append-anything, properties panel, minimap, color picker, bpmnlint), yjs 13.6, y-websocket 3.1, fractional-indexing; Python 3.13, FastAPI 0.142, SQLAlchemy 2.1 async + asyncpg, Alembic, pydantic 2, pwdlib[argon2], pycrdt 0.14, lxml; pytest + httpx; vitest.

**Spec:** `docs/design.md`

## Global Constraints

- Product name: **Coframe** — only via `APP_NAME` in `frontend/src/config/brand.ts` and `settings.app_name` in `backend/app/config.py`.
- Everything in the repo is in English (docs, comments, UI copy).
- Official BPMN names exactly as bpmn-js shows them (`docs/bpmn/notation.md` §11); never rename them.
- JSON API in camelCase; dates ISO 8601 UTC; ids are UUID strings.
- REST under `/api`, WebSockets under `/api/ws`.
- The bpmn.io watermark on the canvas is never hidden or covered.
- Session cookie `sid`: httpOnly, SameSite=Lax, sliding 30-day server-side expiry.
- One backend process (Yjs rooms in memory).
- Limits: XML ≤ 5 MB, SVG preview ≤ 2 MB, names ≤ 200 chars, passwords ≥ 8 chars.
- Local dev ports: web 3100, API 8100 (3000/8000 are taken by other projects).
- Design tokens from spec §11 (black pills, #F3F3F4 surfaces, radii 24/20/full, Onest + Geist Mono).

## Review Focus

1. Two tabs of the same user edit one diagram → changes converge; undo in each tab reverts only that tab's own changes.
2. One user deletes an element while another draws a flow to it → both diagrams keep importing without errors (sanitizer).
3. A jam ends while a guest still has a diagram open → the guest's WS closes with 4403, the UI says "Jam ended", edits are no longer accepted.
4. A file from another tool (`bpmn2:` prefix or default namespace, pretty-printed) imports, edits and exports without loss.
5. The network drops for 30 s while drawing → after reconnecting everything syncs; status goes Offline → Saving… → Saved.

---

## File structure

```
backend/
  pyproject.toml, alembic.ini, migrations/{env.py,versions/}
  app/
    main.py            create_app(), lifespan, CORS, routers
    config.py          Settings (pydantic-settings)
    db.py              Base, engine, SessionLocal, get_db
    models.py          ORM models (spec §5)
    security.py        hash_password / verify_password / new_token / token_hash
    deps.py            CurrentUser, OptionalUser, Db; session cookie helpers
    permissions.py     roles, ProjectAccess, project_access(), load_project/folder/diagram
    ordering.py        fractional-indexing port
    ratelimit.py       in-memory limiter
    schemas/           pydantic DTOs
    services/          domain logic used by the routers
    api/               auth, workspaces, invites, projects, folders, diagrams, jams, me
    bpmn/              flat.py, templates.py, xmlsafe.py, svg.py
    realtime/          encoding.py, awareness.py, rooms.py, hub.py, routes.py
  tests/
frontend/
  src/app/…            routes (see "Routes")
  src/config/brand.ts
  src/lib/api/         client.ts, types.ts, hooks.ts
  src/components/ui/   shadcn primitives
  src/components/{bpmn,editor-chrome,app,project,jam}/
  src/editor/          DiagramEditor, modeler.ts, collab/{flat,binding,provider,presence}.ts, editor.css
  src/realtime/projectChannel.ts
shared/fixtures/bpmn/  BPMN files shared by the TS and Python tests
```

## API contract (single source of truth for frontend and backend)

Types (TypeScript notation, camelCase JSON):

```ts
type Role = 'owner' | 'admin' | 'editor' | 'viewer'
type Access = 'edit' | 'view'
type PublicUser = { id: string; name: string; color: string }
type User = PublicUser & { email: string; createdAt: string }
type Workspace = { id: string; name: string; role: Role; memberCount: number; projectCount: number; createdAt: string }
type Member = { user: PublicUser & { email: string }; role: Role; joinedAt: string }
type Invite = { id: string; token: string; role: Role; createdAt: string; expiresAt: string; createdBy: PublicUser }
type InvitePreview = { workspace: { id: string; name: string }; role: Role; invitedBy: PublicUser; valid: boolean }
type JamSummary = { code: string; access: Access; host: PublicUser; participantCount: number; expiresAt: string }
type Project = { id: string; workspaceId: string; name: string; createdAt: string; updatedAt: string;
                 diagramCount: number; previewDiagramId: string | null; access: Access; role: Role | null; activeJam: JamSummary | null }
type Folder = { id: string; projectId: string; parentId: string | null; name: string; position: string; createdAt: string; updatedAt: string }
type DiagramMeta = { id: string; projectId: string; folderId: string | null; name: string; position: string;
                     createdAt: string; updatedAt: string; contentUpdatedAt: string; previewUpdatedAt: string | null; updatedBy: PublicUser | null }
type Diagram = DiagramMeta & { access: Access }
type Tree = { project: Project; folders: Folder[]; diagrams: DiagramMeta[] }
type TrashItem = { kind: 'folder' | 'diagram'; id: string; name: string; deletedAt: string; itemCount: number }
type JamParticipant = { user: PublicUser; joinedAt: string; isMember: boolean }
type Jam = { id: string; projectId: string; code: string; access: Access; host: PublicUser; createdAt: string; expiresAt: string; participants: JamParticipant[] }
type JamPreview = { code: string; projectName: string; host: PublicUser; participantCount: number; access: Access }
type RecentDiagram = DiagramMeta & { projectName: string; workspaceId: string; workspaceName: string }
type ApiError = { detail: string }
```

Endpoints (`[role]` = minimum workspace role; `jam` = participants of an active jam also have access):

| Method and path | Body | Response | Access / errors |
|---|---|---|---|
| POST /api/auth/signup | {email,password,name} | 201 User + cookie | 409 email_taken, 422 |
| POST /api/auth/login | {email,password} | User + cookie | 401 invalid_credentials, 429 |
| POST /api/auth/logout | — | 204, cookie cleared | — |
| GET /api/auth/me | — | User | 401 |
| PATCH /api/auth/me | {name?,color?,currentPassword?,newPassword?} | User | 400 wrong_password |
| GET /api/workspaces | — | Workspace[] | logged in |
| POST /api/workspaces | {name} | 201 Workspace | logged in, creator = owner |
| GET/PATCH/DELETE /api/workspaces/{id} | {name} | Workspace / 204 | viewer / admin / owner; 409 last_workspace |
| GET /api/workspaces/{id}/members | — | Member[] | viewer |
| POST /api/workspaces/{id}/members | {userId,role} | 201 Member | admin; 403 not_jam_participant (only participants of this workspace's jams can be added directly) |
| PATCH /api/workspaces/{id}/members/{userId} | {role} | Member | admin; only an owner grants owner; 409 last_owner |
| DELETE /api/workspaces/{id}/members/{userId} | — | 204 | admin or self; 409 last_owner |
| GET/POST /api/workspaces/{id}/invites | {role} | Invite[] / 201 Invite | admin; valid 7 days |
| DELETE /api/invites/{inviteId} | — | 204 | admin |
| GET /api/invites/{token} | — | InvitePreview | no login required |
| POST /api/invites/{token}/accept | — | Workspace | logged in; 410 invite_invalid |
| GET /api/workspaces/{id}/projects | — | Project[] (updatedAt desc) | viewer |
| POST /api/workspaces/{id}/projects | {name} | 201 Project (+ one blank diagram) | editor |
| GET /api/projects/{id} | — | Project | viewer, jam |
| PATCH /api/projects/{id} | {name?,workspaceId?} | Project | editor (moving: admin in both workspaces) |
| DELETE /api/projects/{id} | — | 204 | admin |
| GET /api/projects/{id}/tree | — | Tree | viewer, jam |
| GET /api/projects/{id}/trash | — | TrashItem[] | viewer, jam |
| DELETE /api/projects/{id}/trash | — | 204 (empty trash) | editor |
| POST /api/projects/{id}/folders | {name,parentId?} | 201 Folder | editor, jam(edit) |
| PATCH /api/folders/{id} | {name?,parentId?,position?} | Folder | same; 400 folder_cycle |
| DELETE /api/folders/{id}?permanent=bool | — | 204 | same |
| POST /api/folders/{id}/restore | — | Folder | same |
| POST /api/projects/{id}/diagrams | {name?,folderId?,xml?} | 201 DiagramMeta | same; 400 invalid_bpmn |
| GET /api/diagrams/{id} | — | Diagram | viewer, jam; 404 if deleted |
| PATCH /api/diagrams/{id} | {name?,folderId?,position?} | DiagramMeta | editor, jam(edit) |
| DELETE /api/diagrams/{id}?permanent=bool | — | 204 | same |
| POST /api/diagrams/{id}/restore, /duplicate | — | DiagramMeta | same |
| GET /api/diagrams/{id}/xml | — | application/xml, attachment | viewer, jam |
| PUT /api/diagrams/{id}/preview | image/svg+xml | 204 | editor, jam(edit) |
| GET /api/diagrams/{id}/preview | — | image/svg+xml (CSP, ETag) / 404 | viewer, jam |
| GET /api/projects/{id}/jam | — | Jam \| null | viewer, jam |
| POST /api/projects/{id}/jam | {access} | 201 Jam (or the active one) | editor |
| PATCH /api/projects/{id}/jam | {access} | Jam | host or admin |
| DELETE /api/projects/{id}/jam | — | 204 | host or admin |
| GET /api/jams/{code} | — | JamPreview | no login; 404 jam_not_found; 429 |
| POST /api/jams/{code}/join | — | {projectId, jam: Jam} | logged in |
| GET /api/me/recent?limit=12 | — | RecentDiagram[] | logged in |
| GET /api/me/jams | — | Project[] (where I am a guest of an active jam) | logged in |
| GET /api/workspaces/{id}/search?q= | — | {projects: Project[], diagrams: RecentDiagram[]} | viewer |

Jam code: 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, shown as `ABC-DEF`; input is case- and dash-insensitive.

WebSockets:
- `/api/ws/diagrams/{id}`: y-websocket protocol; extra server message `[varUint 100][varUint8Array stateVector]` = "persisted"; close codes 4401/4403/4404/4409.
- `/api/ws/projects/{id}`: JSON. Server → client: `{"type":"presence","users":[{"user":PublicUser,"diagramId":string|null}]}`, `{"type":"tree"}`, `{"type":"project"}`, `{"type":"jam"}`, `{"type":"pong"}`. Client → server: `{"type":"presence","diagramId":string|null}`, `{"type":"ping"}`. Closed with 4403 when access is lost.

## Routes (frontend)

`/` landing · `/login` · `/signup` · `/app` (redirects to the last workspace) · `/w/[workspaceId]` dashboard · `/w/[workspaceId]/settings` members and invites · `/p/[projectId]` project (opens the last/first diagram) · `/p/[projectId]/[diagramId]` editor · `/j/[code]` join a jam · `/invite/[token]` · `/settings` account · `/mockups` layout prototypes. `proxy.ts` redirects to `/login?next=…` when there is no `sid` cookie.

---

## Phase 0 — Scaffolding ✅
- [x] Backend project (uv, FastAPI, SQLAlchemy, Alembic, pytest), databases `coframe` / `coframe_test`
- [x] Frontend project (Next.js 16, Tailwind 4, shadcn, all editor dependencies), rewrites `/api/*` → API
- [ ] `Makefile` (`make dev`, `make test`) and README

## Phase 1 — Backend data, auth, permissions ✅
- [x] Models + migration 0001
- [x] Auth (signup/login/logout/me), sessions, rate limiting — tests
- [x] Permissions (workspace roles + jam access)

## Phase 2 — Backend REST per contract
- [x] Workspaces, members, invites — tests
- [x] Projects — tests
- [x] Tree, trash, diagrams, preview, jams, me, search — implemented
- [ ] Tests for tree/trash, diagrams/preview, jams, me/search

## Phase 3 — Flat BPMN model
- [ ] Python `app/bpmn/flat.py` — tests on `shared/fixtures/bpmn/*.bpmn`: flatten → reconstruct → flatten is idempotent; incoming/outgoing recomputed; sanitizer removes dangling flows/DI/boundary events/flowNodeRefs/defaults; `bpmn2:` prefix and default namespace preserved; entities/XXE rejected
- [ ] TypeScript `src/editor/collab/flat.ts` — same tests in vitest + parity with Python via `shared/fixtures/flat/*.json`

## Phase 4 — Real-time server
- [ ] Yjs protocol encoding (`realtime/encoding.py`, `awareness.py`)
- [ ] Diagram rooms (`realtime/rooms.py`, `routes.py`): two pycrdt clients sync; view-only clients cannot write; awareness echo and removal on disconnect; message 100 after saving; XML rebuilt in the database
- [ ] Project hub WS: presence, `tree` after a folder POST, 4403 after a jam ends

## Phase 5 — Frontend foundation and pages
- [x] Design tokens, BPMN glyphs, editor chrome components, layout mockups (`/mockups`)
- [ ] API client and hooks · auth pages · workspace dashboard (projects, recent, "Join a jam") · workspace + account settings · `/j/[code]` and `/invite/[token]` · landing

## Phase 6 — Editor
- [ ] Modeler with the demo.bpmn.io feature set (incl. create-append-anything), our toolbar instead of the palette, restyled context pad and popup menus, shortcuts, zoom, export/import
- [ ] Yjs ↔ bpmn-js binding: deferred remote apply, keep viewbox/root/selection, Y.UndoManager, save status
- [ ] Presence: cursors, selections, avatars
- [ ] Inspector, minimap, bpmnlint, colors

## Phase 7 — Project files and folders
- [ ] List (screenshot 3) with folder drill-in · thumbnails (screenshot 4) with reordering · drag to move, context menus, rename, duplicate, download, import by drop · trash · live tree and avatars per file

## Phase 8 — Jam
- [ ] Jam dialog (start, code, link, QR, access, end) · participants + Add to workspace · guest handling when a jam ends

## Phase 9 — Verification
- [ ] End-to-end check in a headless browser: 2 users, a jam, concurrent edits, undo, offline
- [ ] Whole-branch review; README with run instructions
