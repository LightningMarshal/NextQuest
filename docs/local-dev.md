# Local development without a Neon account

NextQuest talks to Postgres through Neon's HTTP driver (required on
Cloudflare Workers). You don't need a Neon account to work on it: run a
plain Postgres, and put the repo's tiny **Neon-HTTP shim** in front of it.
The app's real driver runs unmodified; only its endpoint changes.

```
next dev ──(Neon HTTP protocol)──► scripts/neon-http-shim.mjs ──(TCP)──► Postgres
```

## 1. Postgres in Docker

```bash
docker compose -f docker-compose.dev.yml up -d
```

That starts Postgres 17 on `127.0.0.1:5432` (user `postgres`, password
`postgres`) with two databases: `nextquest` for development and
`nextquest_e2e`, which the E2E suite wipes on every run.

No Docker? Any local Postgres 16+ works — create the two databases yourself:

```bash
createdb nextquest && createdb nextquest_e2e
```

## 2. Point the tooling and the app at it

`.env` (Node tooling: migrations, seed):

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nextquest
NEON_HTTP_PROXY_ENDPOINT=http://127.0.0.1:4445/sql
```

`.dev.vars` (the app — start from `.dev.vars.example`), the same two lines
plus the usual secrets:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nextquest
NEON_HTTP_PROXY_ENDPOINT=http://127.0.0.1:4445/sql
BETTER_AUTH_SECRET=<any long random string>
BETTER_AUTH_URL=http://localhost:3000
```

`NEON_HTTP_PROXY_ENDPOINT` is the local-only switch that sends the driver to
the shim. Never set it in production.

## 3. Run

Three terminals (or background the first two):

```bash
SHIM_TARGET=postgresql://postgres:postgres@localhost:5432/nextquest npm run db:shim
```

```bash
npm run db:migrate && npm run seed
```

```bash
npm run dev
```

The seed creates a demo group. Demo members can't sign in — sign in with
your own Google account listed in `ADMIN_EMAILS` and you join alongside
them. (Google sign-in needs real OAuth credentials even locally; the E2E
suite below is the way to exercise the app with no OAuth at all.)

### Counting database round trips

Every query is an HTTP fetch in production, so sequential queries are the
thing to watch. Start the shim with `SHIM_LOG=1` and it prints one line per
round trip — when it started, how long it took, and the SQL:

```bash
SHIM_LOG=1 SHIM_TARGET=postgresql://postgres:postgres@localhost:5432/nextquest npm run db:shim
```

Load a page and read the block it prints: lines with the same start time
ran together; a staircase of start times is a chain worth collapsing with
`Promise.all` or a join.

## 4. The E2E suite

```bash
npm run e2e
```

Needs only the local Postgres from step 1 (not your shim or dev server —
it starts its own on other ports, so stop `npm run dev` first: Next allows
one dev server per checkout). It then:

1. wipes and migrates `nextquest_e2e` from empty, and seeds the demo group;
2. starts the shim, a **fake Discord** (`e2e/fake-discord.mjs`), and
   `next dev` on port 3100 with generated, fake secrets (`.dev.vars.e2e`);
3. runs Playwright: post a session → the bot's card → a guest joins →
   wrap-up; the Discord bot's buttons (signed like Discord signs them);
   admin delete/merge; the PWA's offline page; and an axe accessibility
   scan of every main page.

Sign-in is a minted Better Auth session cookie (`e2e/helpers.ts`) — the app
contains no test-only code. A different Postgres? Set `E2E_DATABASE_URL`;
it must be on localhost (the suite refuses anything else, because it drops
the schema).

First run on a new machine: `npx playwright install chromium`.

## Trying the Worker runtime

`npm run dev` is Node. Before shipping anything that touches crypto,
bindings, or caching, run the real thing:

```bash
npm run preview
```

It builds with OpenNext and serves on workerd (port 8787) using the same
`.dev.vars`.
