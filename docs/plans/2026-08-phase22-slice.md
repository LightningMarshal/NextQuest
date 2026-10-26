# Phase 22 slice — cron failure visibility + migration CI check

Scoped against `origin/main` @ `3f503bb` (Phase 21 merged, PR #38). No open
GitHub issues exist and no `docs/plan.md` convention is in use — this repo's
existing convention is one plan file per effort under `docs/plans/`
(see `2026-07-feature-batch.md`), so this file follows that pattern rather
than creating a `docs/plan.md`.

Phase 22 ("Production confidence", `docs/ROADMAP.md`) has five items. Two are
self-contained and need no new external accounts/secrets:

1. **Error visibility (partial)** — cron task failures currently only
   `console.warn` (silent in prod per the roadmap's own framing). The Discord
   webhook plumbing already exists (`src/lib/discord.ts`); wire cron failures
   through it. Full Worker log shipping / Sentry is deferred — it needs a new
   external account/DSN this session can't provision.
2. **Migration check in CI** — apply `drizzle/` from zero against a scratch
   Postgres service in GitHub Actions so a broken generated migration fails
   the PR, not the deploy.

Deferred (need provisioning or missing infra this session can't create):
automated R2 backups (needs an R2 bucket + binding decision), E2E smoke suite
(needs the Neon-HTTP→Postgres shim Phase 23 notes as "lives in no repo"), PR
preview deploys (needs `wrangler versions upload` wiring + likely new CI
secrets).

## Checklist

- [x] Cron route posts a Discord notice on task failure (still returns 200 —
      no change to the Cloudflare-retry-avoidance behavior)
- [x] CI: new job (or step) that spins up a Postgres service container and
      runs `drizzle-kit migrate` against it from empty
- [x] Verify locally: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build` (all pass); migration job smoke-tested against a
      locally built Postgres 16 (no Docker daemon in this sandbox — the CI
      job itself uses the standard `postgres:17` service container)
- [x] Update `docs/ROADMAP.md` Phase 22 bullets to reflect partial completion
- [x] Log decision in `docs/DECISIONS.md`

## Status

Done — both items implemented, verified locally, roadmap/decisions updated.
Remaining Phase 22 items (Sentry/log shipping, R2 backups, E2E suite, PR
preview deploys) are deferred; each needs external provisioning this
session can't do unattended. See the DECISIONS.md entry for specifics.
