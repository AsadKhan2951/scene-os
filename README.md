# Scene OS

The operating system for scripted-content production: writing, production planning, shoot coordination, expenses, post-production status and AI production intelligence in one workspace.

**Stack:** Next.js (web) · Node.js + Express (API) · MongoDB · Redis + BullMQ (background jobs) · DigitalOcean (Droplet, Managed MongoDB, Spaces).

## Layout

```
apps/
  web/        Next.js App Router, TypeScript, Tailwind. 21 screens.
    src/app/(app)/        one folder per screen (see "Screens")
    src/components/ui.tsx liquid-glass design system: Glass, Chip, Btn, Bar, Tabs, fields
    src/components/shell.tsx  navigation, signed-in user, current production
    src/lib/              API client, formatting, types, navigation
  api/        Express REST API and the background worker (one codebase, two entry points)
    src/server.ts         API entry
    src/worker.ts         storyboard worker entry
    src/models/index.ts   all MongoDB collections
    src/modules/          one file per module: routes, plus *.service.ts where logic is shared
    src/lib/              Claude client, Spaces, queue, image provider, audit log, CRUD helper
    src/scripts/seed.ts   first admin, optional sample data
packages/
  shared/     constants (15 stages, statuses, categories), Zod schemas, health and budget rules
deploy/       Dockerfiles and Caddy config
```

`packages/shared` is the single source of truth for enums and validation. The web app and the API both import from it, so a form and its endpoint cannot drift apart.

## Run it locally

Needs Node 22, pnpm, MongoDB and Redis.

```bash
cp .env.example .env          # set JWT_SECRET and the SEED_ADMIN_* values
pnpm install
pnpm seed                     # creates the first admin
pnpm seed -- --sample         # optional: invented demo productions (never on a live database)
pnpm dev                      # web on :3000, API on :4000
pnpm --filter @sceneos/api dev:worker   # storyboard worker, in a second terminal
```

Checks: `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Screens

| Area | Route | Screen |
|---|---|---|
| Home | `/` | Command centre |
| | `/productions` | Productions registry |
| | `/health` | Production health (RAG) |
| | `/dreamer` | Dreamer AI, reports, Excel exports |
| Write | `/write/new` | New story wizard |
| | `/write/one-liner` | One-liner and episode plan |
| | `/write/script` | Script workspace |
| | `/write/characters` | Characters and casting |
| | `/write/storyboards` | Storyboards |
| | `/write/teaser` | Teaser (realistic 15 to 60 second promo) |
| Produce | `/produce/pipeline` | 15-stage pipeline and scene tracking |
| | `/produce/schedule` | Call sheets |
| | `/produce/people` | Cast and crew |
| | `/produce/milestones` | Milestones timeline |
| | `/produce/documents` | Document vault |
| Money | `/money/approvals` | Expense approvals |
| | `/money/daily` | Daily expense sheet |
| | `/money/budget` | Budget analysis |
| Deliver | `/deliver/board` | Episode status board |
| | `/deliver/reviews` | Episode reviews, project evaluation, sign-off |
| | `/deliver/channel` | Channel delivery checklist |
| On set | `/on-set` | Phone view for the unit |

## API

All routes are under `/api` and need a signed-in session except `/api/auth/login` and `/api/healthz`.

| Module | Base path |
|---|---|
| Auth | `/auth` (login, logout, me) |
| Productions, pipeline, episodes | `/productions` |
| People, milestones, call sheets, weekly plans, characters, reviews | `/people`, `/milestones`, `/call-sheets`, `/weekly-plans`, `/characters`, `/reviews` |
| Expenses and approvals | `/expenses` |
| Portfolio, health, budget, command centre | `/insights` |
| Documents | `/documents` |
| Evaluation and sign-off | `/evaluations` |
| Excel exports | `/exports/{productions,pipeline,episodes,budget,full}` |
| Writers Hub and storyboards | `/writers` |
| Dreamer | `/dreamer` |

## Rules worth knowing

- **Roles.** `admin` and `user`. Only admins can complete a pipeline stage, approve / reject / send back expenses, record a sign-off, unlock a one-liner, or change a channel's delivery requirements. The API enforces this; the web app only hides or disables the controls.
- **Dreamer confirms before it commits.** Approving an expense, completing a stage and changing a production status are never run directly by the AI. Dreamer proposes, the person confirms in the chat, and the role is checked again at that moment. Creating a milestone, adding a person, creating a draft call sheet and updating an episode step run straight away.
- **Audit log.** Approvals, stage changes, status changes, sign-offs, deliveries and every Dreamer action are written to the `auditlogs` collection with who did it and whether it came through Dreamer.
- **Expense sheets lock.** Only drafts can be edited. A submitted sheet is locked until it is approved, rejected, or sent back (which returns it to draft with the comment).
- **Delayed milestones.** A milestone past its due date that is not completed is marked `delayed` the next time health is calculated.
- **Sessions.** JWT in an httpOnly, SameSite=Lax cookie (Secure in production). State-changing requests from another origin are refused.

## Not finished yet

- **Nothing has run against a real MongoDB yet.** Typecheck, unit tests and both builds pass, and the API's sign-in, role and validation rules were exercised without a database. The first real run needs a pass through every screen.
- **Production health levels are placeholders.** The amber and red numbers in `packages/shared/src/health.ts` (75% / 90% budget, 2 / 5 pending sheets) were chosen to fit the product guide's wording, which gives no figures. Confirm them; they can be changed with the `HEALTH_*` env vars.
- **Higgsfield is wired but not yet run live.** `apps/api/src/lib/higgsfield.ts` follows the published API (submit, then poll `status_url`). Set `HIGGSFIELD_API_KEY` as `<key id>:<key secret>`. Images use `higgsfield-ai/soul/v2/standard`; motion clips use `kling-video/v3.0-turbo/image-to-video` (5 seconds, 720p). Both can be changed with `HIGGSFIELD_*` env vars. Without Spaces, files stay on Higgsfield, which keeps them for a limited time.
- **AI features need `ANTHROPIC_API_KEY`.** Dreamer, reports, one-liners, episode writing and storyboard breakdown return a clear "not set up" error without it. They have not been run against the live API.
- **Weekly shooting plans** have an API (`/weekly-plans`) but no screen; the schedule screen works from call sheets.
- **Teaser sound is not yet run live.** `apps/api/src/lib/elevenlabs.ts` makes the voice-over and music. It needs `ELEVENLABS_API_KEY`; the music endpoint and Urdu narration must be confirmed on the first real teaser. Without the key the teaser is made silent.
- **Teaser characters are kept consistent by description only.** The same written look is repeated in every picture; faces can still drift between shots.
- **Teasers are stored on the server's `media` volume**, not in Spaces. Back it up with the Droplet.
- **No user management screen.** Users are created by the seed script.
- **Docker and Caddy files are untested** until the first deploy.
- **Spaces needs a CORS rule** allowing `PUT` from the web origin, because the browser uploads files directly.
- **No CI/CD yet.**

## Deploy

On a Droplet with Docker: clone the repo, create `.env` (set `DOMAIN`, `WEB_ORIGIN=https://<DOMAIN>`, `MONGODB_URI`, `JWT_SECRET`, `SEED_ADMIN_*`), then `docker compose up -d --build`. This runs Caddy (automatic HTTPS), web, api, worker and redis. Create the first admin with `docker compose exec api npx tsx src/scripts/seed.ts`.
