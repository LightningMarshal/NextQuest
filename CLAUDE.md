# CLAUDE.md

## Project overview

**Next Quest** is a single-tenant web app for one gaming group: a shared game
backlog with point values, anonymous voting to prioritize what to play next,
burn-rate tracking, and session scheduling with attendance. One deployment =
one group; members sign in with Google and are approved by an admin.

- Feature roadmap and current phase: `docs/ROADMAP.md`
- Data model, data flow, and future GAC module design: `docs/ARCHITECTURE.md`
- Why the points formula / voting mechanics work the way they do: `docs/DECISIONS.md`
- End-to-end deploy walkthrough for non-developers: `docs/deployment/`

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack) on **Cloudflare Workers**
  via `@opennextjs/cloudflare` (NOT the deprecated `@cloudflare/next-on-pages`)
- **Neon Postgres** + **Drizzle ORM** using `@neondatabase/serverless`
  (HTTP driver — required for Workers; no TCP, no pooler)
- **Better Auth** (Google social sign-in), Drizzle adapter
- **Tailwind CSS v4** + shadcn/ui-style components + `next-themes`
  (dark mode is the default; light mode supported)
- **Recharts** for graphs (burn rate)

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Next dev server (fast, but Node — not workerd) |
| `npm run build` | Next production build |
| `npm run lint` | ESLint (flat config, `eslint.config.mjs`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run preview` | OpenNext build + `wrangler dev` — run before shipping; catches workerd-only breakage |
| `npm run deploy` | OpenNext build + deploy to Cloudflare |
| `npm run cf-typegen` | Regenerate `cloudflare-env.d.ts` from `wrangler.jsonc` |
| `npm run db:generate` | Generate SQL migration from schema changes |
| `npm run db:migrate` | Apply migrations (needs `DATABASE_URL` in `.env`) |
| `npm run db:studio` | Drizzle Studio against the DB |

## Environment variables

Two files, two runtimes — keep `DATABASE_URL` in sync between them:

- **`.dev.vars`** (from `.dev.vars.example`) — Workers runtime for
  `dev`/`preview`: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAILS` (first-admin
  bootstrap: comma-separated emails that arrive approved + admin),
  `DISCORD_WEBHOOK_URL` (optional — notifications no-op without it),
  `CRON_SECRET` (optional — gates `/api/cron`; scheduled tasks no-op without it)
- **`.env`** (from `.env.example`) — Node-side tooling only (drizzle-kit):
  `DATABASE_URL`

Production secrets: `wrangler secret put <NAME>`. Never commit either file.

## Architecture map

```
src/
├── app/
│   ├── (app)/           # members-only: / (dashboard), /backlog, /vote,
│   │   │                #   /events, /admin — layout calls requireApprovedUser
│   │   └── layout.tsx   #   and is force-dynamic (session + DB per request)
│   ├── (auth)/          # public: sign-in, pending-approval
│   └── api/auth/[...all]/  # Better Auth handler
├── components/
│   ├── ui/              # shadcn/ui-style primitives (hand-vendored, see note)
│   └── *.tsx            # theme-provider, theme-toggle, site-nav (user menu)
├── db/
│   ├── index.ts         # getDb() — per-request Neon HTTP + Drizzle client
│   └── schema/          # domain-split: auth, games, votes, events, settings
├── lib/
│   ├── auth.ts          # getAuth() — per-request Better Auth instance
│   ├── auth-client.ts   # Better Auth React client
│   ├── points.ts        # pure points-formula functions
│   └── metadata/        # pluggable game-metadata providers (steam, hltb, manual)
└── server/              # server actions + helpers per domain
    ├── session.ts       # getSessionUser / requireApprovedUser / requireAdmin
    ├── members.ts       # admin member management
    └── games|votes|events.ts
```

**Auth gating:** there is no middleware/proxy file. Protection is server-side:
the `(app)` layout gates pages, and every server action re-checks via
`requireApprovedUser()`/`requireAdmin()` (`src/server/session.ts`). New
protected routes go inside `(app)`; new actions must call a gate first.

**Cron:** the worker entry is `custom-worker.ts` (NOT `.open-next/worker.js`
directly) — it adds a `scheduled` handler that self-fetches
`/api/cron?task=<name>` with the `CRON_SECRET` header via the
`WORKER_SELF_REFERENCE` binding, so task code runs in a normal request
context. New scheduled tasks: register in `src/app/api/cron/route.ts` and map
a cron expression in `custom-worker.ts` + `wrangler.jsonc` `triggers.crons`.

## Conventions & invariants

1. **Vote anonymity** — `votes.user_id` exists only for dedup/upsert. No
   query, API response, or UI may expose another member's votes; tallies are
   `{gameId, SUM(weight)}` aggregates only. The single exception is loading
   the requesting user's own ballot.
2. **Points are stored, not derived at read time.** Recompute only on
   explicit edit of length/difficulty/override, or via the admin-only
   recompute action (proposed/backlog games only) — both through
   `src/lib/points.ts`. Playing/completed/abandoned points never change,
   keeping historical burn-rate stable when the formula is tuned.
3. **All game status changes go through `transitionGameStatus`**
   (`src/server/games.ts`), which appends to `game_status_history`. Never
   update `games.status` directly — history powers burn rate.
4. **Schema changes:** edit `src/db/schema/*`, `npm run db:generate`, commit
   the migration, `npm run db:migrate`. Never hand-edit generated migrations.
   If the Better Auth config changes (plugins, additionalFields), reconcile
   `src/db/schema/auth.ts` with `npx @better-auth/cli generate` output.
5. **HLTB is fragile.** HowLongToBeat has no official API; the provider WILL
   break occasionally. Metadata fetch failures must degrade to manual entry
   (`src/lib/metadata/index.ts` catches per provider) — never block a
   proposal or game on a fetch.
6. **Env access on Workers:** use `getCloudflareContext().env` (see
   `src/db/index.ts`, `src/lib/auth.ts`), not bare `process.env`, in runtime
   code. Bindings are request-scoped — build DB/auth clients per request,
   never at module top level.
7. Path alias `@/*` → `src/*`. Indentation is tabs (create-next-app default
   here) — match it.

## Gotchas

- `next lint` was removed in Next 16 — `npm run lint` calls `eslint .`
  directly with the flat config.
- The shadcn registry (ui.shadcn.com) may be unreachable from sandboxed
  environments; `src/components/ui/*` was hand-vendored to match shadcn
  output. `components.json` is configured, so `npx shadcn add <component>`
  works when the network allows; otherwise vendor by hand in the same style.
- Recharts components need `"use client"`.
- `npm run dev` runs under Node and will happily use APIs that explode under
  workerd — always verify with `npm run preview` before deploying.
- `wrangler.jsonc` must keep `nodejs_compat` in `compatibility_flags`.
