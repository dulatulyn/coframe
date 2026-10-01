# Coframe — platform design (spec)

Date: 2026-09-30 · Status: v1

## 1. What was asked

- A platform for drawing BPMN diagrams, "just like https://demo.bpmn.io/s/start".
- Keep what is good about demo.bpmn.io: everything moves, is added and deleted smoothly, "works like clockwork". The notation shapes are reproduced exactly; the **interface around the canvas is our own** (prettier and a bit different, but just as convenient).
- Fix what is missing there: (1) no accounts and nothing is saved; (2) no teamwork.
- Accounts and saving; a **jam**: join by code or by link, everyone sees everything live, and later the jam can turn into a permanent team.
- New compared to demo.bpmn.io: **folders and files inside a project** (reference screenshots 3 and 4: a "Diagrams" panel with folders and counts, recent files, trash; or a list of thumbnails).
- Design language: mobbin.com (reference screenshots 5–9).
- BPMN must be complete and correct: nothing missing, nothing confused, exact names (see `docs/bpmn/notation.md`).
- Stack: React/Next.js + FastAPI.

## 2. Decisions

| Question | Decision | Why |
|---|---|---|
| Editor engine | **bpmn-js** (the library behind demo.bpmn.io), used as the engine and notation renderer only; all chrome is ours (§8) | Same interaction quality and correct BPMN 2.0 XML. Writing an engine from scratch would take years and be worse |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, shadcn/ui (Radix) | Requested; the landing page renders on the server, the app is client-side |
| Backend | FastAPI, SQLAlchemy 2 (async), Alembic, PostgreSQL | Requested; Postgres already runs locally |
| Real-time collaboration | **Yjs (CRDT)**: `y-websocket` in the browser, our own protocol handler on `pycrdt` inside FastAPI | Guaranteed convergence, per-user undo, awareness for cursors; no separate Node server |
| Authentication | Email + password, server-side sessions in an httpOnly cookie | Simple and safe. OAuth and password reset by email are backlog items |
| UI language | English | Official BPMN names are English |
| Jam guests | An account is required (one-screen sign-up, then straight into the jam) | Needed to turn a jam into a team and to show who is who |
| Scale | One backend process (Yjs rooms in memory) | Enough for the MVP; Redis pub/sub later for several workers |
| Local ports | web 3100, API 8100 | 3000 and 8000 are used by other projects on the dev machine |

## 3. Scope

**MVP:**
1. Accounts: sign up, log in, log out, profile (name, avatar color).
2. Workspaces with members and roles (owner/admin/editor/viewer), invites by link.
3. Projects in a workspace; inside a project **nested folders and diagrams**; trash with restore.
4. bpmn-js editor with demo.bpmn.io behaviour (drag and drop, append next to an element, replace, create/append anything with search, lasso, hand/space/connect tools, snapping, alignment, copy/paste, search, drill-down into collapsed sub-processes, keyboard shortcuts, zoom, export .bpmn/.svg/.png, import .bpmn), plus an inspector (properties), minimap, element colors and model checks (bpmnlint).
5. Autosave of everything (through Yjs) with a "Saving… / Saved / Offline" indicator.
6. **Jam**: 6-character code + link + QR; everyone sees each other's cursors, selections and edits live; who is in which file; the host can add participants to the workspace (from jam to team).
7. mobbin-style design: landing, auth, dashboard, project, editor.

**Backlog:** element comments, version history with restore, token simulation, OAuth, email (password reset, invites by email), dark theme, UI localization, horizontal scaling, mobile editor, choreography/conversation diagrams (not supported by bpmn-js).

## 4. Architecture

```
Browser (Next.js app, :3100)
 ├─ REST  /api/*  ──(Next rewrites in dev / reverse proxy in prod)──► FastAPI (:8100) ──► PostgreSQL
 ├─ WS    /api/ws/diagrams/{id}   (binary Yjs protocol: sync + awareness)
 └─ WS    /api/ws/projects/{id}   (JSON: project presence + tree/jam events)
```

- **Source of truth for diagram content** is the Yjs document (`diagrams.ydoc_state`). `diagrams.xml` is derived: the server rebuilds BPMN XML from Yjs on every save (for export, API and search).
- **Source of truth for structure** (workspaces, projects, folders, names, permissions) is PostgreSQL via REST. Tree changes are broadcast on the project channel as "re-fetch" events.
- Yjs rooms live in the backend process: loaded on first connection, saved to the database with a ~1 s debounce, unloaded 30 s after the last client leaves.

## 5. Data model (PostgreSQL)

```
users(id uuid pk, email unique (stored lower-case), name, password_hash, color, created_at)
sessions(id pk = sha256(token), user_id fk, created_at, expires_at, last_seen_at, user_agent)
workspaces(id, name, created_by fk users, created_at)
workspace_members(workspace_id fk, user_id fk, role enum(owner,admin,editor,viewer), created_at, pk(workspace_id,user_id))
workspace_invites(id, workspace_id fk, token unique, role, created_by, created_at, expires_at, revoked_at)
projects(id, workspace_id fk, name, created_by, created_at, updated_at, deleted_at)
folders(id, project_id fk, parent_id fk folders null, name, position text collate "C", created_at, updated_at, deleted_at, trashed_with)
diagrams(id, project_id fk, folder_id fk null, name, position text collate "C",
         xml text, ydoc_state bytea null, preview_svg text null, preview_updated_at,
         created_by, updated_by, created_at, updated_at, content_updated_at, deleted_at, trashed_with)
jams(id, project_id fk, code unique, access enum(edit,view), host_id fk, created_at, expires_at, ended_at)
jam_participants(jam_id fk, user_id fk, joined_at, pk(jam_id,user_id))
```

- Order inside a folder is `position` (fractional-index string), so dragging changes one row.
- Trash is `deleted_at`. Trashing a folder moves it and its whole subtree to the trash (`trashed_with` = folder id); restore brings them back; "delete forever" removes rows.
- Permissions: the workspace role gives access to every project of the workspace. An active jam gives its participants `edit`/`view` access to that one project.

## 6. API

The full contract (types, endpoints, errors) is in the plan: `docs/roadmap.md`, section "API contract".

WebSockets:
- `/api/ws/diagrams/{id}`: the y-websocket protocol (sync step1/step2/update, awareness, query-awareness). The server checks the session cookie and the Origin header and the user's access (for `view` access incoming updates are ignored), replaces the `user` field in awareness states with the real session user, echoes awareness to every client (like the reference server; otherwise the client watchdog drops the connection after 30 s), and sends its own message type `100 persisted` (state vector of what was saved) for the "Saved" indicator. Close codes: 4401 not logged in, 4403 no access / jam ended, 4404 deleted, 4409 content replaced (reload).
- `/api/ws/projects/{id}`: JSON: `presence` (who is online and in which diagram), `tree` (re-fetch the tree), `project`, `jam`; the client sends `presence {diagramId}` and `ping`.

## 7. Real-time collaboration

### 7.1 Flat BPMN model (shared by TypeScript and Python)
BPMN XML is split into a map `id → entry`. An entry is every XML element with an `id` whose parent also has an id (or is the root). Entry fields:
- `t` tag (`bpmn:task`, `bpmndi:BPMNShape`, …), `p` parent id (`""` for the root), `o` order key among siblings (fractional indexing);
- `@attr` one key per attribute (except `id`), namespace declarations included;
- `#tag` children **without** an id (bounds, waypoints, documentation, conditionExpression, BPMNLabel, …), canonically serialized and concatenated per tag;
- `~bpmn:flowNodeRef|<id>` lane membership as a set, so concurrent additions do not get lost;
- `x` own text (rare).

`bpmn:incoming/outgoing` are not stored; they are recomputed from sequence flows when XML is rebuilt (this removes a whole class of conflicts).

In Yjs: `doc.getMap('elements')` is `Y.Map<id, Y.Map<key, string>>`. Concurrent edits of **different keys of one element** merge (one person renames, another moves: DI and semantics are different entries anyway). Edits of the same key: last writer wins. A delete wins over an edit.

### 7.2 Sanitizer (before importing into bpmn-js and before the server writes XML)
A merge can leave dangling references (A deletes a task while B draws a flow to it). The sanitizer repeatedly removes: entries without a parent, DI without `bpmnElement`, flows/associations without source or target, boundary events without `attachedToRef`, `flowNodeRef`s to deleted nodes, `default` pointing to a deleted flow, duplicate DI of one element. The result always imports cleanly.

### 7.3 Binding to bpmn-js
- **Local change** (`commandStack.changed`, except `clear`): `saveXML` → flatten → diff against the "shadow" (the state currently drawn) → write the changed keys to Yjs with origin `LOCAL`. The diff is against the shadow, not against Yjs, otherwise remote changes that are not drawn yet would be reverted.
- **Remote change** (any origin other than `LOCAL`, including undo): on the next frame, rebuild XML from Yjs → sanitize → `importXML`, keeping the viewbox, the current plane (drill-down) and the selection. bpmn-js clears and renders synchronously in one task, so nothing flickers. While the user drags, edits a label, has a menu open or types in the inspector, applying is deferred until the interaction ends.
- After an import: export → if it differs from Yjs (the sanitizer removed something, prefixes were normalized), write the difference with origin `SANITIZE` (not undoable). The process is idempotent, no ping-pong.
- **Undo/Redo**: `Y.UndoManager` with `trackedOrigins={LOCAL}`: Ctrl+Z undoes only your own changes and leaves everyone else's. The native bpmn-js undo is replaced (the `undo`/`redo` editor actions are re-registered). The selection before/after is stored in the stack item meta.

### 7.4 Presence
Yjs awareness: `{user:{id,name,color}, cursor:{x,y}|null (diagram coordinates), root, selection:[ids]}`. Cursors are an HTML layer over the canvas with smooth interpolation; selections are colored frames with the user's name in a canvas layer (`canvas.getLayer`). Cursor updates at most ~25/s.

## 8. Editor UX

Only the **notation shapes** are copied exactly (BPMN standard). The **interface around the canvas is our own**: from demo.bpmn.io we take the *behaviour* (drag and drop, append next to an element, keyboard shortcuts, smoothness), not the look.

- Engine and shape rendering: bpmn-js (correct notation and BPMN XML).
- The built-in bpmn-js palette is replaced by **our own React toolbar** calling bpmn-js APIs (`create.start`, `elementFactory`, hand/lasso/space/global-connect tools). Element groups open flyouts with every variant and its exact BPMN name (e.g. "Task" → User task, Service task, …) and keyboard shortcuts.
- Context pad (quick actions next to the selection) and popup menus (change type, create/append anything with search) are bpmn-js features restyled to our design system.
- Our own controls: zoom (−/%/+/fit), minimap, export/import, shortcuts, inspector.
- Layout options A (floating islands) and B (docked studio) are prototyped at `/mockups`; the user picks one.
- The bpmn.io watermark stays visible (bpmn-js license).

## 9. Folders and files (screenshots 3–4)

Project panel (collapsible):
- Header: project name (menu: rename, settings, move to another workspace), collapse button.
- Black pill **New diagram** + **New folder**; search "Search diagrams".
- **List** mode (screenshot 3): folders with counts and a chevron (drill in, breadcrumb back), then files of the current folder with "Updated 2 hours ago"; **Trash** at the bottom.
- **Thumbnails** mode (screenshot 4): numbered previews of the diagrams in the current folder; drag to reorder; "+ New diagram" at the bottom.
- Drag a file onto a folder/breadcrumb to move it; context menu: Open, Rename, Duplicate, Move to…, Download .bpmn, Delete. Import by dropping `.bpmn` files onto the panel.
- Sort: Manual (default) / Last updated / Name.
- Avatars next to files show who is in them right now (project channel).

## 10. Jam

1. In a project, **Jam** → "Start jam" (edit or view access) → a code `K7M-Q2P`, a link `/j/K7MQ2P`, a QR code, copy buttons.
2. Join: type the code on the dashboard ("Join a jam") or open the link → jam page (project, host, how many people) → **Join** (sign up / log in first if needed, then come back).
3. Inside: avatars in the header, cursors and selections on the canvas, who is in which file in the tree.
4. The host sees the participants: **Add to workspace** (one or all) turns the jam into a team: they become workspace editors and keep access after the jam.
5. **End jam**: the code stops working, guests (non-members) are disconnected (4403). A jam expires after 24 h.

## 11. Design system (after mobbin)

- Fonts: Onest (Latin + Cyrillic) for UI and headings, headings 600–700 with tight tracking (−0.035em); Geist Mono for codes, shortcuts and numbers. Text #101012, secondary #71717A.
- White background, light gray surfaces #F3F3F4, borders #E7E7EA. Black accent: primary buttons are black pills, secondary are white pills with a thin border. Cobalt (#2F6BFF) only for focus and canvas selection; coral "beacon" (#FF5B2E) only for the live-jam state.
- Large radii: cards 24 px, popovers 20 px, inputs and buttons fully round.
- Segmented controls on gray with a white active segment; underlined tabs; "New/Updated" badges; popovers like mobbin's "Quick save" (gray section labels, bordered icon boxes, black check circles).
- Icons: lucide (1.5–2 px). Short animations (150–200 ms).
- The bpmn-js canvas stays classic (white, dotted grid); popup menus and the context pad get our radii and shadows.

## 12. Security

- Passwords: Argon2 (pwdlib). Sessions: random 32-byte token, only its SHA-256 is stored; cookie `httpOnly`, `SameSite=Lax`, `Secure` in production. Mutating requests are JSON only (no CSRF through forms).
- WS: cookie + Origin checks; access is checked on connect and again when a jam ends or a member is removed (connections are closed).
- XML parsing on the server: lxml without entities or network (XXE-safe). Size limits (XML 5 MB, SVG 2 MB). SVG previews are sanitized and served with `Content-Security-Policy: default-src 'none'`.
- Rate limits for login and jam code lookups (in process memory).

## 13. Testing

- Python: pytest on a real local database `coframe_test`: auth, permissions, tree/trash, jams, WS sync (a pycrdt client speaking the y-websocket protocol), flatten/reconstruct/sanitize.
- TypeScript: vitest: flatten/reconstruct/sanitize/diff/order keys, round trips on BPMN fixtures shared with Python (`shared/fixtures`).
- Browser checks (headless Playwright): two users, a jam, concurrent edits, undo.

## 14. Risks

| Risk | Mitigation |
|---|---|
| Re-importing on remote changes disrupts interaction | Defer until drag/label edit/menu ends; keep viewbox, plane and selection |
| Large diagrams (500+ elements): an import takes 100–300 ms | Batch remote changes into one import per frame; targeted patching later if needed |
| TS and Python flat-model implementations drift | Shared fixtures and parity tests; a drift is harmless (normalized in one pass) |
| The bpmn.io license requires a visible watermark | Our panels never cover it |
