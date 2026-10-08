# Scene OS: notes for Claude

Production operating system for Pakistani Urdu drama serials: Writers Hub (story, one-liner, script, characters, storyboards, scene video), 15-stage pipeline, call sheets, expenses and approvals, delivery board, Dreamer AI. The user (Aamir) writes in Roman Urdu and wants short replies with an action note, not long explanations.

## Stack

- **Monorepo:** pnpm workspaces (`pnpm@10.28.0`, Node 22).
  - `apps/web`: Next.js 15 App Router, React 19, Tailwind 3, SWR, lucide-react. Port 3000.
  - `apps/api`: Express 4, Mongoose 8, Zod, JWT httpOnly cookie, BullMQ on Redis. Port 4000. Built with tsup (`dist/server.js`, `dist/worker.js`); dev runs through tsx.
  - `packages/shared`: enums, Zod schemas, health and budget rules, script helpers, teaser timing. Single source of truth for both apps.
  - `deploy/`: `api.Dockerfile` (API and worker; includes ffmpeg and Noto font), `web.Dockerfile` (Next standalone), `Caddyfile`.
- **Database:** MongoDB Atlas (database `sceneos`). Redis runs as a container.
- **AI and media:** Anthropic (planning and writing), Higgsfield (images `higgsfield-ai/soul/v2/standard`, Soul ID characters, edit `alibaba/qwen-image-3/edit`, clips `kling-video/v3.0-turbo/image-to-video`), ElevenLabs (voice-over; music needs a paid plan), ffmpeg (cutting scene videos).

## Commands

Run from the repo root.

| What | Command |
|---|---|
| Install | `pnpm install --frozen-lockfile` |
| Type-check everything | `pnpm typecheck` |
| Tests (shared + api, vitest) | `pnpm test` |
| Build everything | `pnpm build` |
| Build one app | `pnpm --filter @sceneos/api build` / `pnpm --filter @sceneos/web build` |
| Dev (web :3000, api :4000) | `pnpm dev` |
| Dev worker (second terminal) | `pnpm --filter @sceneos/api dev:worker` |
| First admin | `pnpm seed` (local) / `docker compose exec api npx tsx src/scripts/seed.ts` (server) |

Local dev needs MongoDB, Redis and a `.env` copied from `.env.example`. The user does not run the app locally; everything is tested on the server.

**Before every push:** `pnpm typecheck && pnpm test && pnpm build` must pass.

## Git

- Remote: `https://github.com/AsadKhan2951/scene-os.git`
- **Deploy branch: `main`.** A push to `main` deploys to production (see below). Work on a feature branch and merge to `main` only when the checks pass.
- To push from a Claude session, the repo must be attached with push access (`add_repo` with `access: "push"` for `AsadKhan2951/scene-os`).
- End commit messages with the attribution lines the session gives.
- Never commit `.env` or any key. It is in `.gitignore`.

## Server

- **One DigitalOcean Droplet, not App Platform.** Name `scene-os-production`, IP `143.244.128.63`, user `root`.
- Live site: **https://143-244-128-63.sslip.io** (free sslip.io name until there is a real domain; Caddy issues HTTPS on its own).
- Repo on the server: `~/scene-os`. Secrets live only in `~/scene-os/.env` on the server; only the user edits it.
- `docker-compose.yml` runs five containers: `caddy` (80/443), `web`, `api`, `worker`, `redis`. Volumes: `media` (finished scene videos at `/data/media/teasers`), `caddy-data`, `caddy-config`, `redis-data`. Caddy sends `/api/*` to `api:4000` and everything else to `web:3000`.
- Health check: `GET /api/healthz` returns `{"ok":true}`.

## Deploy

**Automatic (preferred):** `.github/workflows/deploy.yml` runs on every push to `main` (or by hand from the Actions tab). It runs typecheck, tests and build, then connects to the Droplet over SSH and runs:

```bash
cd ~/scene-os && git pull --ff-only origin main && docker compose up -d --build && docker image prune -f
```

and finally checks `https://143-244-128-63.sslip.io/api/healthz`. It needs three repository secrets (GitHub → Settings → Secrets and variables → Actions): `DROPLET_HOST` (`143.244.128.63`), `DROPLET_USER` (`root`), `DROPLET_SSH_KEY` (a private key whose public half is in the Droplet's `~/.ssh/authorized_keys`). So the full loop for Claude is: change code, run the checks, commit, push to `main`, then watch the workflow run (`gh run watch`) and test the live site.

Watching a deploy from a Claude session: `gh run list --limit 3`, then `gh run watch <id> --exit-status`. The session cannot download Actions log files (that host is blocked), so the deploy step writes any failure as an annotation; read it with `gh api repos/AsadKhan2951/scene-os/check-runs/<job id>/annotations --jq '.[].message'` (job id from `gh run view <id> --json jobs`).

**By hand (fallback):** in the Droplet console, `cd ~/scene-os && git pull && docker compose up -d --build`. Logs: `docker compose logs --tail=60 api worker`.

Notes:
- A restart of the `worker` container marks any scene video that was rendering as failed. Finished shots are reused when it is made again.
- If the repo is made private, the Droplet needs a deploy key to `git pull`.
- The Claude session's own shell cannot reach the Droplet directly (its network is allow-listed); deploys go through GitHub Actions or the user's console.

## Live testing

Test on the live site with real data, through the browser. Sign-in is a cookie session, so call the API from the page with `fetch('/api/...', { credentials: 'include' })`. Long jobs (storyboards, scene videos) run in the worker: poll their status rather than waiting on one request. Higgsfield and ElevenLabs spend real credits; check what a test will cost, and say when credits run out (`not_enough_credits`).

## Rules that must not break

- **Pakistani drama, never Bollywood.** All AI prompts for story, storyboard and video go through the art director brief in `apps/api/src/lib/artDirector.ts`: real Pakistani locations and clothes, no Indian cultural markers, no Hindi vocabulary in Urdu lines.
- **Storyboard frames are the source of truth for the scene video.** Each frame carries a continuity sheet (cast with wardrobe and facing, place, light, lens, camera, props). The video planner follows it frame for frame; do not add, drop or reorder frames.
- **Character consistency:** each person is cast once and trained as a Higgsfield Soul ID (`Character.soulId`), reused in every scene. Shots seen from behind are drawn without the face reference on purpose.
- **Newer Anthropic models think before answering and do not accept assistant prefill.** Use `generateJson` in `apps/api/src/lib/anthropic.ts` for structured output, with a generous `max_tokens`.
- **Roles:** only admins can complete a pipeline stage, approve, reject or send back expenses, sign off, unlock a one-liner, or change delivery requirements. The API enforces this.
- **Dreamer confirms before committing** money, stage and status actions.

## Open items

- ElevenLabs music needs a paid plan; Spaces is not set up (Higgsfield files are temporary, document upload returns 503).
- Rotate the keys that were pasted in chat (Anthropic, Higgsfield, MongoDB, JWT) and consider making the GitHub repo private.
- No user management screen; no weekly plan screen.
