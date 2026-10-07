# Coframe

**Model business processes together.** Coframe is a free, real-time collaborative BPMN 2.0 and DMN
modeler with an AI copilot that actually understands your diagram. It runs on
[bpmn.io](https://bpmn.io) and adds everything a team needs around it: live co-editing, comments,
version history, simulation, analysis views, public links and more.

**Try it:** [coframe.run](https://coframe.run). No account needed to start a diagram.

```
   ○ ──▶ [ Check order ] ──▶ ◇ Order OK? ──yes──▶ [ Send invoice ] ──▶ ◎
                               │
                               └──no──▶ ● Order rejected
          ↑ Aigerim is editing          ↑ Daniyar left a comment
```

## What you get

### Draw together, live
- **Real-time co-editing.** Everyone sees each other's cursors, selections and changes as they
  happen. Built on CRDTs (Yjs), so offline edits merge cleanly when you reconnect.
- **Jams.** Share a 6-character code or a link; guests can join without signing up.
- **Comments.** Threads on any element or on the whole diagram, with replies and resolve. Badges
  on the canvas show where the discussion is.
- **Version history.** Snapshots while you work, one-click restore, and a visual diff: what was
  added, changed, moved and removed since any version.

### An AI copilot on the canvas
- **Select and ask.** Pick elements (click, Shift, lasso) or press **⌘K**, then say what you want:
  *"add error handling here"*, *"run these in parallel"*, *"if the order is rejected, email the
  customer"*. The change lands on the diagram, highlighted, with **Keep / Undo**.
- **Chat that edits.** Ask questions about the process or ask for changes in plain language.
- **Review.** A full analysis with explanations, consequences and one-click fixes.
- **Next step.** Autocomplete for processes: three suggestions for what comes next.
- **Generate.** Describe a process in words and get a laid-out diagram.

Every AI proposal is validated by code before you see it: it is simulated on a copy of the model,
re-checked with exact BPMN rules, and dropped if it would break the process. Runaway or malformed
model answers are detected while streaming and retried.

### Exact checks, no AI needed
About 25 structural rules run on every change: missing start or end events, unreachable and dead-end
elements, endless loops, implicit splits and joins, deadlocks between exclusive splits and parallel
joins, merges without synchronization, unlabeled decisions, misused message flows and more.

### Views on the same diagram
| View | What it shows |
|---|---|
| **Simulate** | Tokens flow through the process; you pick branches at decisions. |
| **Paths** | Every scenario from start to end, highlighted on the canvas, with loops and dead ends flagged. |
| **Roles** | A RACI matrix built from lanes, editable and exportable to CSV. |
| **Time & cost** | Durations, costs and branch odds, an expected time and cost for the process, and a heatmap. |
| **Present** | A full-screen, step-by-step walkthrough for meetings. |

### More
- **Decision tables (DMN 1.3)** with the full dmn-js editor (DRD, decision tables, literal and boxed
  expressions). Business rule tasks link to their decision table.
- **Process map.** Call activities link to other diagrams; the map shows how processes call each other.
- **Sub-processes your way.** Expand one in place (the rest of the diagram makes room) or keep it on
  its own page with a clear way back.
- **Public links and embeds.** A view-only link anyone can open, plus an `<iframe>` for Notion,
  Confluence or a website. Turn it off at any time.
- **Export** to BPMN, SVG, PNG, JPEG and PDF, or copy as an image.

## Under the hood

| Layer | Stack |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, shadcn/ui, bpmn-js 18, dmn-js 17 |
| Backend | FastAPI, SQLAlchemy 2 (async), Alembic, PostgreSQL |
| Real time | Yjs over WebSockets (`y-websocket` in the browser, a `pycrdt` server inside FastAPI) |
| AI | Gemini (Pro for reviews and edits, Flash for suggestions) with structured output |
| Hosting | Docker Compose on one VM behind Caddy (automatic HTTPS) |

A BPMN diagram is stored as a flat map of XML elements inside a Yjs document, so concurrent edits
to different elements merge without conflicts and the server can always rebuild valid BPMN XML.

## Run it locally

Requirements: PostgreSQL 14+, [uv](https://docs.astral.sh/uv/), Node.js 22+.

```bash
make install   # backend (uv sync) + frontend (npm install)
make db        # create the coframe / coframe_test databases and run migrations
make dev       # API on http://localhost:8100, web app on http://localhost:3100
```

Open http://localhost:3100, start a diagram, and to try a jam open **Share → Jam session** and
join from a second browser profile with the code. Ports 3100 and 8100 avoid clashes with other
local projects.

### Configuration

Backend settings come from `backend/.env` (see `backend/.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://localhost/coframe` | database |
| `ALLOWED_ORIGINS` | `["http://localhost:3100", …]` | CORS and WebSocket origin check |
| `PUBLIC_APP_URL` | `http://localhost:3100` | base URL used in links and OAuth redirects |
| `COOKIE_SECURE` | `false` | set `true` behind HTTPS |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | — | enables "Continue with Google" |
| `GEMINI_API_KEY` | — | enables the AI features (or use `GCP_PROJECT` with Application Default Credentials) |
| `AI_MONTHLY_BUDGET_USD` | `80` | hard monthly cap on AI spending |

**Google sign-in:** create an OAuth client of type *Web application* in Google Cloud and add the
redirect URI `http://localhost:3100/api/auth/google/callback` (and your production domain's
equivalent).

**AI:** set `GEMINI_API_KEY`, or `GCP_PROJECT` to use Vertex AI with Application Default
Credentials. Models default to the newest Gemini Pro and Flash (`AI_MODEL_SMART`, `AI_MODEL_FAST`).
AI is available to registered users only. Every request is recorded with its token counts and
estimated price; once `AI_MONTHLY_BUDGET_USD` is reached all AI calls stop for the month, and daily
per-user limits apply (`AI_DAILY_REVIEWS`, `AI_DAILY_MESSAGES`, `AI_DAILY_SUGGESTIONS`,
`AI_DAILY_GENERATIONS`).

**Analytics:** production builds load Google Tag Manager (`NEXT_PUBLIC_GTM_ID`) with Consent Mode v2:
nothing is stored until a visitor allows it. Page views are sent as `coframe_page_view` with a page
type and a path where ids and access tokens are replaced by placeholders, and product events
(`sign_up`, `login`, `guest_start`, `diagram_create`, `jam_start`, `jam_join`, `ai_command`,
`view_open`, `export`, …) go to the data layer. Diagram content is never sent.

The frontend proxies `/api/*` to the API (`API_URL`, default `http://localhost:8100`) and opens
WebSockets directly (`NEXT_PUBLIC_WS_URL`, default `ws://localhost:8100` in development).

## Tests

```bash
make test      # pytest (backend, real Postgres) + vitest (frontend)
make lint
```

Useful scripts:

```bash
node frontend/scripts/jam-bot.mjs <JAM-CODE>      # a bot that joins a jam and edits like a person
node frontend/scripts/check-bpmn.mjs <file.bpmn>  # report import warnings of a BPMN file
node frontend/scripts/sync-soak.mjs --clients 4   # concurrent random edits with offline periods, then check convergence
cd backend && PYTHONPATH=. uv run python scripts/ai_eval.py English   # run the AI review on fixtures with known flaws
```

## Deployment

Production runs with Docker Compose on a single VM: PostgreSQL, the API, the Next.js server, a
backup service and Caddy, which terminates HTTPS and sends `/api/*` (including WebSockets) to
FastAPI and everything else to Next.js.

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

GitHub Actions (`.github/workflows/ci.yml`) lints, tests and builds every push and pull request, and
deploys pushes to `main` with the same script. It needs the secrets `DEPLOY_HOST`, `DEPLOY_USER`,
`DEPLOY_SSH_KEY` and the variable `DEPLOY_URL`.

### Keeping data safe

- **Every edit is saved continuously**, about a second after each change. Browsers also keep a local
  copy (IndexedDB), so work done offline is sent once the connection is back.
- **Version history** keeps snapshots of every diagram; any version can be previewed, compared,
  downloaded or restored, and restoring is itself undoable.
- **Database backups** run every 6 hours into `~/coframe/backups` on the VM (the last 28 are kept).
  `deploy/verify-backup.sh` restores the newest dump into a scratch database and compares row counts.
- **Off-site copies:** add a snapshot schedule to the VM's disk in your cloud console.

```bash
cd ~/coframe
docker compose --env-file .env -f src/deploy/compose.yml exec -T db \
  pg_restore -U coframe -d coframe --clean --if-exists --no-owner < backups/coframe-<timestamp>.dump
```

## Repository layout

```
backend/            FastAPI app (app/), Alembic migrations, tests
  app/api/          REST endpoints
  app/ai/           model graph, exact checks, operations, simulation, prompts, Gemini client
  app/realtime/     Yjs rooms (y-websocket protocol) and the project presence channel
frontend/           Next.js app
  src/editor/       bpmn-js editor, Yjs binding, AI on the canvas, views, DMN editor
  src/components/   design system, editor chrome, project files, sharing
shared/fixtures/    BPMN files shared by the Python and TypeScript tests
deploy/             Docker Compose stack, Caddy, deploy scripts
docs/               BPMN notation reference, design, roadmap
```

## Credits

The diagram canvas is [bpmn-js](https://github.com/bpmn-io/bpmn-js) and the decision editor is
[dmn-js](https://github.com/bpmn-io/dmn-js), both by bpmn.io and used under the bpmn.io license,
which requires its watermark to stay visible. Coframe never hides or covers it. Token simulation
comes from [bpmn-js-token-simulation](https://github.com/bpmn-io/bpmn-js-token-simulation).
