# Coframe

A collaborative BPMN 2.0 modeler. Draw processes with the standard notation (rendered by
[bpmn-js](https://bpmn.io)), keep them in projects with folders, and edit together in real time:
start a **jam**, share a 6-character code or link, and everyone sees each other's cursors,
selections and changes live.

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, shadcn/ui, bpmn-js
- **Backend:** FastAPI, SQLAlchemy 2 (async), Alembic, PostgreSQL
- **Real time:** Yjs over WebSockets (`y-websocket` in the browser, a `pycrdt` server inside FastAPI)

## Run it locally

Requirements: PostgreSQL 14+ running locally, [uv](https://docs.astral.sh/uv/), Node.js 22+.

```bash
make install   # backend (uv sync) + frontend (npm install)
make db        # create the coframe / coframe_test databases and run migrations
make dev       # API on http://localhost:8100, web app on http://localhost:3100
```

Open http://localhost:3100, create an account, create a project and start drawing.
To try a jam, open **Share → Start jam** and join from a second browser profile with the code.

Ports 3100 and 8100 are used so they don't collide with other local projects on 3000/8000.

### Configuration

Backend settings come from `backend/.env` (see `backend/.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://localhost/coframe` | database |
| `ALLOWED_ORIGINS` | `["http://localhost:3100", …]` | CORS and WebSocket origin check |
| `PUBLIC_APP_URL` | `http://localhost:3100` | base URL used in links and OAuth redirects |
| `COOKIE_SECURE` | `false` | set `true` behind HTTPS |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | — | enables "Continue with Google" |

**Google sign-in:** in Google Cloud Console create an OAuth client of type *Web application* and
add the authorized redirect URI `http://localhost:3100/api/auth/google/callback`. Put the client id
and secret into `backend/.env` and restart the API; the button appears on the login page.

The frontend proxies `/api/*` to the API (`API_URL`, default `http://localhost:8100`) and opens
WebSockets directly (`NEXT_PUBLIC_WS_URL`, default `ws://localhost:8100` in development). In
production put both behind one domain (e.g. a reverse proxy sending `/api` to FastAPI).

## Tests

```bash
make test      # pytest (backend, real Postgres) + vitest (frontend)
make lint
```

## Scripts

```bash
node frontend/scripts/jam-bot.mjs <JAM-CODE> [--diagram <id>] [--steps 10] [--api http://localhost:8100]
node frontend/scripts/check-bpmn.mjs <file.bpmn>
node frontend/scripts/sync-soak.mjs [--clients 4] [--ops 80] [--api http://localhost:8100] [--restart-cmd "<cmd>"]
```

`jam-bot.mjs` joins a live jam as "Jam Bot" and works on a diagram like a second person: it moves
its pointer, selects shapes, appends tasks and types their names, so collaboration can be watched
without a second browser. `check-bpmn.mjs` parses a BPMN file with bpmn-moddle and reports every
import warning (unresolved references, unknown elements). `sync-soak.mjs` opens several
collaborators on a fresh diagram, makes random concurrent edits with offline periods (optionally
restarting the API halfway), then checks that everyone converged, a fresh client loads the same
document and the saved XML imports without warnings.

## Deployment

Production runs with Docker Compose on a single VM: PostgreSQL, the API, the Next.js server and
Caddy, which terminates HTTPS (Let's Encrypt) and sends `/api/*` (including WebSockets) to FastAPI
and everything else to Next.js.

```
deploy/compose.yml      services and volumes
deploy/caddy/           reverse proxy
deploy/provision.sh     one-time VM setup: Docker, swap
deploy/deploy.sh        ships the current commit to the VM and restarts the stack
deploy/verify-backup.sh restores the newest backup into a scratch database (run on the VM)
deploy/pull-backups.sh  copies the backups from the VM
```

First deployment:

```bash
ssh user@host 'bash -s' < deploy/provision.sh
scp deploy/production.env user@host:coframe/.env     # variables from deploy/.env.example
DEPLOY_HOST=host DEPLOY_USER=user DEPLOY_URL=https://your.domain ./deploy/deploy.sh
```

GitHub Actions (`.github/workflows/ci.yml`) lints, tests and builds every push and pull request;
pushes to `main` are deployed with the same script. It needs the repository secrets
`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` and the variable `DEPLOY_URL`.

For Google sign-in in production add `https://your.domain/api/auth/google/callback` to the
OAuth client's authorized redirect URIs.

### Keeping data safe

- **Every edit is saved continuously.** The server writes a diagram about a second after each
  change and keeps writing while changes arrive. Browsers also keep a local copy (IndexedDB), so
  work done offline or in a tab that lost its connection is sent once it reconnects.
- **Version history.** Every diagram keeps snapshots of its content (about every ten minutes of
  editing, when everyone leaves, and before a restore). Any version can be previewed, downloaded or
  restored from the editor; restoring is itself undoable.
- **Database backups.** The `backup` service dumps PostgreSQL every 6 hours into `~/coframe/backups`
  on the VM and keeps the last 28 dumps (`BACKUP_EVERY` / `BACKUP_KEEP` in the env file).
  `deploy/verify-backup.sh` (run on the VM) restores the newest dump into a scratch database and
  compares row counts; `deploy/pull-backups.sh` copies the dumps to your machine.
- **Off-site copies.** Add a snapshot schedule to the VM's disk in Google Cloud (Compute Engine →
  Snapshots → Snapshot schedules) so a lost VM can be recreated.

Restoring a dump on the VM:

```bash
cd ~/coframe
docker compose --env-file .env -f src/deploy/compose.yml exec -T db \
  pg_restore -U coframe -d coframe --clean --if-exists --no-owner < backups/coframe-<timestamp>.dump
```

## Layout

```
backend/            FastAPI app (app/), Alembic migrations, tests
  app/api/          REST endpoints
  app/realtime/     Yjs rooms (y-websocket protocol) and the project presence channel
  app/bpmn/flat.py  BPMN XML <-> flat element map used for merging
frontend/           Next.js app
  src/editor/       bpmn-js editor, Yjs binding, live presence
  src/components/   design system, editor chrome, project files, jam dialog
shared/fixtures/    BPMN files shared by the Python and TypeScript tests
deploy/             Docker Compose stack, Caddy, deploy scripts
docs/               BPMN notation reference, design, roadmap
```

- BPMN notation reference: [`docs/bpmn/notation.md`](docs/bpmn/notation.md)
- Design: [`docs/design.md`](docs/design.md)
- Roadmap: [`docs/roadmap.md`](docs/roadmap.md)

## License notes

bpmn-js is used under the bpmn.io license, which requires its watermark to stay visible on the
canvas. Coframe never hides or covers it.
