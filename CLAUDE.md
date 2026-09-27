# CLAUDE.md

## Project overview

**NextQuest** helps one gaming group play more games with more people. Its
centre is the **session**: "I'm playing Rust Tuesday night, hop in" — posted
in a few taps, announced as one Discord card that updates itself as people
join, joinable by the group's members *and* a wider circle of guests
(friends-of-friends, Discord-server members), and closed out afterwards with
a 10-second wrap-up so every past session shows who came and how it went.

Around it: a rich game **library** (genres, descriptions, time-to-beat,
reception, "who's keen"), **find-a-time polls** for nights that need
planning, and **stats**. One deployment = one group.

- Design history and the 2026-09 redesign rationale: `docs/DECISIONS.md`
- Data model and data flow: `docs/ARCHITECTURE.md`
- Roadmap: `docs/ROADMAP.md`
- Deploy walkthrough for non-developers: `docs/deployment/` (the redesign's
  live-data migration runbook is `docs/deployment/12-redesign-migration.md`)

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
| `npm run preview` | OpenNext build + `wrangler dev` — run before shipping; catches workerd-only breakage |
| `npm run deploy` | **Runs `db:migrate` against `.env`'s DATABASE_URL**, then builds + deploys |
| `npm run seed [-- --reset]` | Demo group (members, a guest, open + members sessions, keen, polls) |
| `npm run db:shim` | Local Neon-HTTP shim over plain Postgres (`scripts/neon-http-shim.mjs`) |
| `npm run db:generate` / `db:migrate` / `db:studio` | Drizzle migrations |
| `npm run cf-typegen` | Regenerate `cloudflare-env.d.ts` from `wrangler.jsonc` |

Local dev without Neon: run Postgres, `SHIM_TARGET=<pg url> npm run db:shim`,
and set `NEON_HTTP_PROXY_ENDPOINT=http://127.0.0.1:4445/sql` in `.dev.vars`.

## Environment variables

- **`.dev.vars`** (from `.dev.vars.example`) — Workers runtime:
  `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (also the base for
  links in Discord and calendar feeds), `GOOGLE_CLIENT_ID`/`SECRET`,
  `ADMIN_EMAILS` (first-admin bootstrap), optional `DISCORD_CLIENT_ID`/
  `DISCORD_CLIENT_SECRET` (Discord sign-in) + `DISCORD_GUILD_IDS`
  (comma-separated servers whose members come in as guests), optional
  `DISCORD_WEBHOOK_URL` (legacy single webhook; more are added on /admin),
  `CRON_SECRET`, `BGG_API_TOKEN`, `RAWG_API_KEY`.
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

## Architecture map

```
src/
├── app/
│   ├── (circle)/        # guest-visible, self-gating pages: / (This week),
│   │                    #   /sessions, /s/[id]
│   ├── (app)/           # members: /sessions/new, /s/[id]/edit, /sessions/plan
│   │                    #   (polls), /backlog (Library) + /backlog/[id],
│   │                    #   /stats, /review, /members/[id], /invites, /admin;
│   │                    #   /events, /pick, /vote are redirects
│   ├── (auth)/          # public: /sign-in (?next=), /apply, /invite/[token]
│   └── api/             # auth, cron (secret), calendar (token),
│                        #   sessions/[id]/ics (session), export (admin)
├── components/          # app-shell, site-nav, sessions/*, ui/* (vendored shadcn)
├── db/schema/           # auth, events, circle (invites, applications,
│                        #   discord_webhooks), interest (keen), games, …
├── lib/                 # pure + tested: sessions, discord-embed, when-label,
│                        #   safe-redirect, ids, ical, points (frozen), metadata/*
└── server/              # actions ("use server") + *-read.ts helpers
    ├── session.ts       # the gates
    ├── sessions.ts | sessions-read.ts   # the heart of the app
    ├── discord.ts       # multi-webhook delivery, edit-in-place announcements
    ├── circle.ts        # invites + applications
    ├── game-status.ts   # the ONLY games.status writer (atomic CTE + history)
    └── cron/            # reminders, wrap-up nudge, auto-close, metadata refresh
```

## Conventions & invariants

1. **Visibility is enforced at the data layer.** Any new query that returns
   sessions to a page must apply the guest filter (`canSeeSession` /
   `visibilityFilter` in `sessions-read.ts`). Any new action touching a
   session must check visibility for guests.
2. **Discord text is member-typed input.** Always send
   `allowed_mentions: { parse: [] }` and escape markdown (`md()` /
   `escapeMarkdown`) — `src/server/discord.ts` does this for you; don't POST
   to webhooks directly. Session announcements are edited in place via
   `syncSessionAnnouncement(eventId)`; call it after any change a reader
   would care about.
3. **All game status changes go through `applyStatusTransition`**
   (`src/server/game-status.ts`), which updates and appends
   `game_status_history` in one statement. Never update `games.status`
   directly — history powers burn-rate and the activity feed.
4. **Effort points are frozen history.** Since the 2026-09 redesign nothing
   writes `games.points`/`points_override` and the picker/voting UIs are
   gone; the columns, `votes`, and the retired `app_settings` columns are
   retained (non-destructive policy). Votes were promised anonymous — never
   expose per-member vote rows, and never convert them into public "keen".
5. **Pick-free, keen-public.** "Keen" (`game_interest`) is public within the
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
10. Path alias `@/*` → `src/*`. Tabs. Match the surrounding comment density.

## Gotchas

- `wrangler.jsonc` must keep `nodejs_compat` and `"keep_names": false` —
  esbuild's `__name` helper breaks next-themes' inline anti-flash script
  ("__name is not defined" on every page).
- `next lint` is gone in Next 16 — `npm run lint` runs `eslint .`.
- next/image optimizes only provider art hosts (`src/lib/images.ts`, shared
  with `next.config.ts`); use `<GameArt>` so pasted URLs render unoptimized
  instead of turning `/_next/image` into an open proxy.
- Recharts components need `"use client"`.
- The shadcn registry may be unreachable in sandboxes; `src/components/ui/*`
  is hand-vendored.
