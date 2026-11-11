# CLAUDE.md

## Project overview

**NextQuest** helps one gaming group play more games with more people. Its
centre is the **session**: "I'm playing Rust Tuesday night, hop in" — posted
in a few taps, announced as one Discord card that updates itself as people
join, joinable by the group's members *and* a wider circle of guests
(friends-of-friends, Discord-server members), and closed out afterwards with
a 10-second wrap-up so every past session shows who came and how it went.

Around it: a rich game **library** (genres, descriptions, time-to-beat,
reception, "I'd play this"), **find-a-time polls** for nights that need
planning, and **stats**. One deployment = one group. An optional **Discord
bot** puts I'm in / Maybe / Out buttons on the session card and answers
`/sessions` and `/post`.

- Design history and the 2026-09 redesign rationale: `docs/DECISIONS.md`
- Data model and data flow: `docs/ARCHITECTURE.md`
- Roadmap: `docs/ROADMAP.md`
- Deploy walkthrough for non-developers: `docs/deployment/` (the redesign's
  live-data migration runbook is `12-redesign-migration.md`; the Discord bot
  is `13`, backups and logs `14`, PR previews `15`)
- Local dev without Neon, and the E2E suite: `docs/local-dev.md`

## Stack

- **Next.js 16** (App Router, TypeScript; production build uses webpack —
  `next build --webpack`) on **Cloudflare Workers** via
  `@opennextjs/cloudflare` (NOT the deprecated `@cloudflare/next-on-pages`)
- **Neon Postgres** + **Drizzle ORM** using `@neondatabase/serverless`
  (HTTP driver — required for Workers; no TCP, no pooler). The HTTP driver
  DOES support atomic multi-statement writes via `db.batch([...])` (one
  transaction); it does not support interactive transactions.
- **Better Auth** (Google + optional Discord sign-in), Drizzle adapter
- **Tailwind CSS v4** + shadcn/ui-style components + `next-themes`
  (dark default)
- **Recharts** for the legacy burn-rate chart on /stats

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Next dev server (Node — not workerd) |
| `npm run build` | Next production build |
| `npm run lint` / `npm run typecheck` / `npm test` | ESLint / `tsc --noEmit` / Vitest |
| `npm run e2e` | Playwright against `next dev` + local Postgres + the shim + a fake Discord (smoke flow, bot buttons, admin hygiene, PWA, axe). Stop `npm run dev` first |
| `npm run preview` | OpenNext build + `wrangler dev` — run before shipping; catches workerd-only breakage |
| `npm run deploy` | **Runs `db:migrate` against `.env`'s DATABASE_URL**, then builds + deploys |
| `npm run seed [-- --reset]` | Demo group (members, a guest, open + members sessions, keen, polls) |
| `npm run db:shim` | Local Neon-HTTP shim over plain Postgres (`scripts/neon-http-shim.mjs`); `SHIM_LOG=1` prints one line per DB round trip |
| `npm run db:generate` / `db:migrate` / `db:studio` | Drizzle migrations |
| `npm run cf-typegen` | Regenerate `cloudflare-env.d.ts` from `wrangler.jsonc` |

Local dev without Neon: run Postgres (`docker compose -f
docker-compose.dev.yml up -d`), `SHIM_TARGET=<pg url> npm run db:shim`, and
set `NEON_HTTP_PROXY_ENDPOINT=http://127.0.0.1:4445/sql` in `.dev.vars`
(`docs/local-dev.md`).

## Environment variables

- **`.dev.vars`** (from `.dev.vars.example`) — Workers runtime:
  `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (also the base for
  links in Discord and calendar feeds), `GOOGLE_CLIENT_ID`/`SECRET`,
  `ADMIN_EMAILS` (first-admin bootstrap), optional `DISCORD_CLIENT_ID`/
  `DISCORD_CLIENT_SECRET` (Discord sign-in) + `DISCORD_GUILD_IDS`
  (comma-separated servers whose members come in as guests), optional
  `DISCORD_WEBHOOK_URL` (legacy single webhook; more are added on /admin),
  optional `DISCORD_BOT_TOKEN` + `DISCORD_PUBLIC_KEY` (the bot; channels are
  added on /admin), `CRON_SECRET`, `BGG_API_TOKEN`, `RAWG_API_KEY`, optional
  `BACKUP_RETENTION_DAYS` (default 90). Local/E2E only, never in production:
  `NEON_HTTP_PROXY_ENDPOINT`, `DISCORD_API_BASE`.
- **Bindings** (`wrangler.jsonc`): optional R2 bucket `BACKUPS` — commented
  out by default (a deploy fails if the bucket doesn't exist).
- **`.env`** — Node tooling only (drizzle-kit, seed): `DATABASE_URL`.

Production secrets: `wrangler secret put <NAME>`. Never commit either file.

## Access model (read this before touching any route or action)

| Tier | Who | Sees / does |
| --- | --- | --- |
| admin | approved, role admin | everything + /admin |
| member | approved, role member | sessions (all), post/host, library, polls, stats, invites |
| guest ("the circle") | approved, role guest | **open** sessions only: see, RSVP, calendar; apply for membership |
| pending / rejected | signed in, not approved | /apply only (pending may redeem an invite) |

How people get in: invite links (members mint them on /invites; token
stored hashed; redemption admits a PENDING account as a guest), Discord
sign-in by a member of a `DISCORD_GUILD_IDS` server (→ guest), or a
membership application reviewed by an admin (→ member). `ADMIN_EMAILS`
arrive as admins.

Gates live in `src/server/session.ts` — there is no middleware/proxy:
- `(app)` route group = members only; its layout calls `requireMember()`.
- `(circle)` route group = guest-visible (/, /sessions, /s/[id]). Its layout
  **does not redirect** (a layout can't know the URL, and Discord deep links
  must survive sign-in), so **every page in `(circle)` must call
  `requireCircleUser("<its path>")` itself** — `src/app/(circle)/gates.test.ts`
  fails CI otherwise. `(circle)` has no `loading.tsx` on purpose: a loading
  boundary streams before the page's gate runs and turns 307/404 into soft
  client-side redirects.
- Every server action re-checks its gate, and session actions also check
  visibility (`canSeeSession`), host-or-admin (`canManageSession`), and
  phase (`src/lib/sessions.ts`). Guests only ever receive open sessions —
  the filter lives in the queries (`src/server/sessions-read.ts`), not the
  pages.
- A read helper must NOT live in a `"use server"` file (that makes it a
  public POST endpoint): use `*-read.ts` server-only modules.
- `/api/discord/interactions` has no browser session at all. Its gate is
  the Ed25519 signature check (must stay first), then the Discord id →
  account lookup; it creates no accounts and goes through `applyRsvp`, the
  same rule set as the web RSVP action. Slash commands follow the same
  tiers (`src/server/discord-commands.ts`): guests list open sessions only
  and can't `/post`; library titles are suggested to members only. Every
  reply is ephemeral — `/sessions` differs per viewer, so a public reply
  would leak members-only sessions into the channel.

## Architecture map

```
src/
├── app/
│   ├── (circle)/        # guest-visible, self-gating pages: / (This week),
│   │                    #   /sessions, /s/[id], /connect-discord
│   ├── (app)/           # members: /sessions/new, /s/[id]/edit, /sessions/plan
│   │                    #   (polls), /backlog (Library) + /backlog/[id],
│   │                    #   /stats, /review, /members/[id], /invites, /admin;
│   │                    #   /events, /pick, /vote are redirects
│   ├── (auth)/          # public: /sign-in (?next=), /apply, /invite/[token]
│   ├── manifest.ts      # PWA manifest (public)
│   └── api/             # auth, cron (secret), calendar (token),
│                        #   sessions/[id]/ics (session), export (admin),
│                        #   discord/interactions (Discord's signature)
├── components/          # app-shell, site-nav, sessions/*, ui/* (vendored shadcn)
├── db/schema/           # auth, events, circle (invites, applications,
│                        #   discord_webhooks, discord_bot_channels),
│                        #   interest (keen), games, …
├── lib/                 # pure + tested: sessions, discord-embed,
│                        #   discord-interactions, discord-commands,
│                        #   backup, game-hygiene,
│                        #   when-label, safe-redirect, ids, ical,
│                        #   points (frozen), metadata/*
└── server/              # actions ("use server") + *-read.ts helpers
    ├── session.ts       # the gates
    ├── sessions.ts | sessions-read.ts   # the heart of the app
    ├── session-rsvp.ts  # applyRsvp — the ONE RSVP rule set (web + bot)
    ├── session-create.ts # insertSession — the ONE session insert (web + /post)
    ├── discord-commands.ts # /sessions, /post, game autocomplete (DB half)
    ├── discord.ts       # webhook + bot delivery, edit-in-place announcements
    ├── bot-channels.ts  # admin actions: bot channels, command registration
    ├── circle.ts        # invites + applications
    ├── game-status.ts   # the ONLY games.status writer (atomic CTE + history)
    ├── game-admin.ts    # admin delete / merge of games (never writes status)
    ├── export-read.ts   # the snapshot — shared by /api/export and backups
    └── cron/            # reminders, wrap-up nudge, auto-close, metadata
                         #   refresh, weekly R2 backup
e2e/                     # Playwright suite + fake Discord + stack prep
public/sw.js             # service worker: offline page only, caches NO pages
```

## Conventions & invariants

1. **Visibility is enforced at the data layer.** Any new query that returns
   sessions to a page must apply the guest filter (`canSeeSession` /
   `visibilityFilter` in `sessions-read.ts`). Any new action touching a
   session must check visibility for guests.
2. **Discord text is member-typed input.** Always send
   `allowed_mentions: { parse: [] }` and escape markdown (`md()` /
   `escapeMarkdown`) — `src/server/discord.ts` does this for you; don't POST
   to webhooks or the bot API directly. Session announcements are edited in
   place via `syncSessionAnnouncement(eventId)`; call it after any change a
   reader would care about. Bot replies are ephemeral and built by
   `ephemeralReply` (mentions disabled there too).
3. **All game status changes go through `applyStatusTransition`**
   (`src/server/game-status.ts`), which updates and appends
   `game_status_history` in one statement. Never update `games.status`
   directly — history powers burn-rate and the activity feed.
   The admin delete/merge tools (`game-admin.ts`) remove or re-point rows
   but never write `games.status`; a merge keeps the surviving game's
   history as is (don't "combine" histories — it double-counts completions).
4. **Effort points are frozen history.** Since the 2026-09 redesign nothing
   writes `games.points`/`points_override` and the picker/voting UIs are
   gone; the columns, `votes`, and the retired `app_settings` columns are
   retained (non-destructive policy). Votes were promised anonymous — never
   expose per-member vote rows, and never convert them into public "keen".
5. **Pick-free, keen-public.** "Keen" (`game_interest`; the UI label is
   **"I'd play this"** — never show the word "keen" to users) is public within the
   group; a non-proposer marking a suggested game keen promotes it to
   want-to-play (the old "a proposal needs a second" rule).
6. **Schema changes:** edit `src/db/schema/*`, `npm run db:generate`, commit
   the migration. Migrations must be additive/reversible — write and test a
   rollback in `drizzle-rollback/` for anything non-trivial. Editing a
   generated migration is allowed only before it has run anywhere real, with
   a comment explaining why (see 0020's `IF NOT EXISTS`).
7. **HLTB is fragile.** Metadata failures must degrade to manual entry
   (`src/lib/metadata/index.ts`); never block a game or session on a fetch.
8. **Env access on Workers:** `getCloudflareContext().env`, never bare
   `process.env`, in runtime code. Build DB/auth clients per request.
   `getSessionUser`/`getAppSettings` are React-`cache()`d per request — use
   them rather than re-querying.
9. **Times:** store instants; convert datetime-local in the browser; render
   with `LocalTime` / `SessionWhen` (hydration-safe `useSyncExternalStore`
   with a primitive snapshot — returning a fresh object is the infinite
   render loop that once crashed the events page). Never `format()` a date
   server-side for display: Workers run in UTC.
10. **Round trips:** every query is an HTTP fetch. Run independent queries
    with `Promise.all`, reach dependent rows with a join rather than a
    second wave, and check a page with `SHIM_LOG=1` before and after.
11. **The service worker never caches pages or API responses** — every page
    is per-viewer (guests see less). Keep `public/sw.js` to the offline
    fallback.
12. **Accessibility is in CI:** `e2e/a11y.spec.ts` runs axe (WCAG 2.1 AA) on
    every main page in both themes. New pages go in its list; contrast
    comes from the theme tokens, so don't dim text with `/60`-style opacity.
13. Path alias `@/*` → `src/*`. Tabs. Match the surrounding comment density.

## Gotchas

- Use npm 11+ (`npx npm@11 install` if your Node ships npm 10). npm 10.9
  crashes or calls the lockfile out of sync; CI pins `npm@11.21.1`.
- `wrangler.jsonc` must keep `nodejs_compat` and `"keep_names": false` —
  esbuild's `__name` helper breaks next-themes' inline anti-flash script
  ("__name is not defined" on every page).
- `next lint` is gone in Next 16 — `npm run lint` runs `eslint .`.
- next/image optimizes only provider art hosts (`src/lib/images.ts`, shared
  with `next.config.ts`); use `<GameArt>` so pasted URLs render unoptimized
  instead of turning `/_next/image` into an open proxy.
- Recharts components need `"use client"`.
- `next dev` keeps simulated-binding state in `node_modules/.cache/`
  (`next.config.ts`): in `.wrangler/state` the local R2 bucket's SQLite
  writes look like source edits and every page reloads in a loop.
- `next dev` rewrites `AGENTS.md` on start (git-ignored), and allows one dev
  server per checkout — `npm run e2e` starts its own, so stop yours first.
- Changing `COMMANDS` (`src/lib/discord-commands.ts`) does nothing in
  Discord until an admin presses **Set up slash commands** on /admin again.
  Discord has no date-time option and gives no timezone — don't add clock
  times to `/post` without a timezone source (DECISIONS 2026-11-11).
- Cloudflare static assets redirect `/x.html` → `/x`; a service worker must
  not cache a redirected response for navigations (see `public/sw.js`).
- `@playwright/test` and `playwright-core` are pinned to the same exact
  version (axe's peer dep otherwise pulls a second, type-incompatible core).
- The shadcn registry may be unreachable in sandboxes; `src/components/ui/*`
  is hand-vendored.
