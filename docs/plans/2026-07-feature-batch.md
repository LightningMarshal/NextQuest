# Feature batch — implementation plan (2026-07)

Scoped against `origin/main` @ `2e03bf0` (Phases 0–12 complete: auth, backlog,
voting, dashboard, events, GAC, polish, picker, tabletop core, tabletop picker,
campaign sessions, BGG provider). Prepared for implementation by a follow-up
session; every claim below was verified against that commit with file/line
anchors. Product decisions in this plan were confirmed by the owner
(2026-07-12): build **both** an explore/browse surface and per-game detail
pages; proposer **cannot approve their own proposal** (self-voting stays
allowed); burn-rate period toggle persists via **URL + cookie** (no per-user
table); this plan lives in the repo.

**Branch note:** the working branch `claude/ttrpg-board-game-coordination-t92bch`
was cut from a pre-Phase-8 main and carries two fix commits (issues #14/#15)
built against that stale base. Workstream 0 reconciles this before anything
else.

Ordering below is a suggested sequence — WS1 bugs first, then ascending size.
Each workstream is independently shippable.

---

## WS0 — Branch reconciliation (prerequisite) — ✅ DONE (2026-07-12)

Rebased onto `origin/main` and pushed (`git push --force-with-lease`). The
conflict surface was verified with a read-only `git merge-tree --write-tree`
simulation before rebasing (this corrects an earlier draft of this section,
which guessed at four conflicting files) — **only
`src/app/(app)/backlog/game-card.tsx` had a real conflict**:

- `src/server/games.ts` auto-merged cleanly (our `updateGameArtwork` addition
  and main's `proposeTabletopGame`/`refreshGameMetadata`/`backfillGameModes`
  landed in non-overlapping regions).
- `next.config.ts` had no conflict — main never touched it since divergence,
  so the wildcard `remotePatterns` addition applied untouched. This also
  **fixes a live bug on main**: BGG board-game/TTRPG cover art
  (`cf.geekdo-images.com`) and manual tabletop cover URLs were broken on
  backlog cards because only Steam CDNs were allowlisted.
- `src/app/(app)/backlog/[gameId]/page.tsx` had no conflict (new file, only
  on our side) — carried forward as the seed for WS3, but it predates the
  tabletop data model and still needs `tabletop_details` fields
  (system/format/GM/players) and session history added (see WS3).
- `src/app/(app)/backlog/propose-form.tsx` and `backlog/page.tsx` auto-merged
  cleanly (main rewrote these heavily; our branch never touched them).

`game-card.tsx`'s five overlapping hunks (imports; derived variables;
pitch/tabletop-info display block; art-header/title `<Link>` wrapping vs
type badge/"EFFORT" relabel; Manage-expander forms) were reconciled by hand,
keeping both sides' additions — main's tabletop info line, campaign strip,
type badge, and refresh-metadata button all coexist with our pitch read-more
expander, proposer byline, and artwork-edit form.

Verified: `npm run typecheck`, `npm run lint`, and `npm run build` all pass;
the OpenNext/Cloudflare build (`npm run preview`) completed the workerd
bundling step cleanly (`Worker saved in .open-next/worker.js`, no
compatibility errors) — the meaningful proxy for "does this run under
Workers." A live click-through wasn't possible in the environment this was
executed from (no `DATABASE_URL`/secrets, and the local `wrangler dev`
server didn't come up under that sandbox's network policy) — **do a full
`npm run preview` click-through before shipping**: propose a video game and
a tabletop game, confirm both card variants render correctly together
(type badge, effort label, tabletop info line, campaign strip where
applicable, pitch read-more, proposer byline, artwork-edit form, detail-page
link).

## WS1 — Bug fixes (small; ship first)

**Status (2026-07-12): 1a, 1b, 1c ✅ done and pushed. 1d deferred (HLTB
unreachable from the execution sandbox — needs an egress-open environment).
1e skipped for now per owner.**

### 1a. Past-date event crash + validation — ✅ done
There is currently **no past-date validation anywhere**, and the most
plausible crash is the unguarded conversion in
`src/app/(app)/events/create-event-form.tsx:30-37`:
`new Date(local).toISOString()` throws `RangeError: Invalid time value` inside
the client action. A *valid* past date doesn't throw — it lands the event
straight in "Needs wrap-up" (`events/page.tsx:16-30`), which is the
reproducible defect.

- Guard the conversion: check `Number.isNaN(date.getTime())` before
  `.toISOString()`; show a field error instead of throwing.
- Server: `.refine(d => d.getTime() > Date.now(), "Must be in the future")` on
  `scheduledAt` in `createEventSchema` (`src/server/events.ts:13-20`) and on
  each entry of `slotStarts` in `src/server/availability.ts:13-18` (GAC has
  the same gap).
- Client: set `min` on both `datetime-local` inputs
  (`create-event-form.tsx:70`, `create-poll-form.tsx:85`). `min` needs a
  local-time string — compute it client-side (both forms are already client
  components).

### 1b. 15-minute increments (start time + duration) — ✅ done
- Client: `step={900}` (seconds) on both `datetime-local` inputs so the picker
  snaps to :00/:15/:30/:45. Event duration input already has `step="15"`
  (`create-event-form.tsx:74`); the GAC length `<select>` (60/90/120/180/240)
  is already coarse.
- Server (real enforcement — the client value is reconstructed and trivially
  bypassable): Zod refines in both schemas — `scheduledAt` / each slot:
  `d.getUTCMinutes() % 15 === 0 && d.getUTCSeconds() === 0`;
  `durationMinutes % 15 === 0`.

### 1c. Proposer cannot approve their own proposal — ✅ done
Today `transitionGameStatus` (`src/server/games.ts:321-370`) gates only on
`requireApprovedUser()` — any member, including the proposer, can promote
`proposed → backlog` ("Add to backlog" button, `game-card.tsx:242-251`).

- Server: in `transitionGameStatus`, when `game.status === "proposed" &&
  toStatus === "backlog"`, select `proposedBy` and throw if
  `user.id === game.proposedBy` ("Someone else has to add your proposal to
  the backlog."). Keep every other transition unrestricted. **Do not touch
  voting** (owner decision: self-voting stays; blocking it would leak ballot
  info and violate the anonymity invariant).
- UI: `game-card.tsx` already receives the full game row — pass the current
  user id down from `backlog/page.tsx` (fetch via `getSessionUser`), hide the
  "Add to backlog" button for the proposer and show a muted hint instead.
  Server check is the source of truth; UI is a courtesy.

### 1d. HLTB scraping broken — deferred (sandbox egress blocks HLTB)
`src/lib/metadata/hltb.ts` reverse-engineers HLTB's Next.js bundle per
request: regex 1 finds the `_app-*.js` chunk (`:43`), regex 2 extracts the
rotating endpoint+key from a `fetch("/api/<path>/".concat(...))` pattern
(`:54-56`). One of these no longer matches (or the POST payload shape moved).
**HLTB is unreachable from the CI sandbox (egress 403), so diagnose where
egress is open** (local dev or deployed preview):

```sh
curl -sA "<UA from hltb.ts>" https://howlongtobeat.com | grep -oE '_next/static/chunks/pages/_app-[^"]+\.js'
# then fetch that chunk and grep for: fetch\("/api/    — inspect how the key is now built
```

Fix = update the regex(es)/payload to the current bundle shape, keeping the
discovery-at-request-time strategy and the 8s timeout. Consider loosening
regex 1 to tolerate hash format changes (e.g. `_app-[\w.]+\.js`). Failure mode
is already graceful (per-source status + retry in the propose form; never
blocks proposals) — the fix restores data, no UX change. Acceptance: HLTB
results appear in the propose typeahead and `fetchGameMetadata` populates
`hltb*` fields under `npm run preview`.

### 1e. Google avatar broken image (issue #7) — skipped per owner (2026-07-12)
One-liner already diagnosed in the issue: add `referrerPolicy="no-referrer"`
to the avatar `<Image>` in `src/components/site-nav.tsx` (~L48-57), plus an
`onError` fallback to the initial-letter span if desired. Owner asked to
hold off for now — do not fold into this batch.

## WS2 — Burn-rate period toggle (weekly / monthly / yearly / all-time) — ✅ done (2026-07-12)

Shipped: `buildBurnRateSeries` generalized to week/month/year buckets with a
trailing-window option (`PERIOD_CONFIG`: weekly=12wk, monthly=12mo, yearly=all
years, all=full-history weekly = unchanged default); `getDashboardData(period)`
builds a weekly series for the projection (units stay points/week) and a
separate display series for the chart; `DashboardPage` resolves period from
`?period=` → `nq-burn-period` cookie → `all`, and a client `BurnPeriodToggle`
segmented control writes the cookie on click. `BurnRatePoint.weekStart` renamed
`bucketStart`. Verified the pure lib across all four periods (trailing windows
preserve the true cumulative). typecheck/lint/build green.

Original notes:

Current state: `src/lib/burn-rate.ts` hardcodes Monday-week cumulative buckets
over all history (`buildBurnRateSeries`, `:21-44`); regression projects from
the last 12 weekly points (`:47-61`); the chart
(`src/app/(app)/burn-rate-chart.tsx`) takes `{series, totalPoints,
projection}` with no period concept; there is **no per-user preference storage
anywhere** — URL searchParams is the established view-state idiom
(backlog `?tag=&sort=`, pick context).

- `burn-rate.ts`: add a `period` parameter (`"weekly" | "monthly" | "yearly" |
  "all"`) to `buildBurnRateSeries`. Weekly = today's behavior. Monthly/yearly
  bucket with date-fns `startOfMonth`/`startOfYear`; "all-time" = weekly
  buckets, full history (rename of today's view) — so the four options are
  really: trailing 12 weeks / trailing 12 months / trailing years / everything.
  Decide labels in the UI, keep the lib pure. **Keep the projection computed
  from the weekly series regardless of display period** (regression assumes
  week units; re-deriving per period adds noise for no benefit).
- `src/server/dashboard.ts` `getDashboardData()`: accept the period, pass
  through; the completion-event query is unchanged (bucketing is in the lib).
- `src/app/(app)/page.tsx`: read `?period=` from searchParams (validate
  against the whitelist), fall back to a `nq-burn-period` cookie via
  `cookies()`, default `weekly`. Render a segmented `<Link>` control exactly
  like the backlog `SORTS` control (`backlog/page.tsx:25-30, 131-146`). A tiny
  client component sets the cookie (`document.cookie`) when the period link is
  clicked — server components can't set cookies during render.
- Chart: keep the same props; the x-axis label format comes from the series
  labels the lib emits.

## WS3 — Explore, game detail pages, and clearer completion (the big UX slice)

Owner wants **both** a browse surface and per-game detail pages. Today: no
detail route on main; completing a game requires Backlog → card → expand
"Manage" → "Mark completed" (`game-card.tsx:236-251`); the backlog filters by
tag only; genre/mode/type data already exists per game
(`game_metadata.genres`, `game_metadata.game_modes`, `tags`, `game_type`,
BGG taxonomy) but is not filterable.

### 3a. Game detail page — `src/app/(app)/backlog/[gameId]/page.tsx`
Seeded from the WS0-rebased version; extend to main's feature set:
- Large art, title, status + type badges, effort points, full pitch with
  proposer byline, full description, genres/modes/tags, Steam/BGG signals,
  tabletop info (system · format · platform · GM · players from
  `tabletop_details`), and **session history** for the game (completed events
  where `events.gameId = id` — the same join the campaign strip uses,
  `backlog/page.tsx:71-96`), showing date, attendance count, and recap
  (richer once WS4 lands).
- **Completion made obvious:** for `playing` games render a prominent
  "Mark completed" primary button (plus the other legal transitions,
  secondary) directly on the detail page — not behind an expander. Reuse
  `transitionGameStatus`; also surface "Mark completed" outside the Manage
  expander on "Now playing" cards on `/backlog`. This is the owner's "clearer
  way to decide the game is completed."
- Cards link here (art + title), per the #15 pattern from WS0.

### 3b. Explore/browse upgrade
Upgrade `/backlog` in place rather than adding a parallel page (one canonical
browse surface; `/pick` remains the decision tool):
- Add filter chip rows alongside the existing tag chips
  (`backlog/page.tsx:151-172`): **type** (video/board game/TTRPG from
  `games.gameType`), **genre** (distinct values from `game_metadata.genres`),
  **mode** (the six `GameMode` values from `src/lib/pick.ts:14-20`). Same
  URL-param + `<Link>` badge pattern; filters compose with tag + sort.
- Cards already show genres (first 3), modes, tags, tabletop line, review %,
  votes — with WS0's pitch/proposer improvements and detail links this
  satisfies "browse the menu with enough info to decide."
- **Mood filters:** no mood taxonomy exists. Map "mood" onto the
  genre + mode + tag filters for now (members can create mood-like tags such
  as "chill" or "brainburner" today); a bespoke mood taxonomy is deliberately
  deferred — record in DECISIONS.md.
- `/pick`: add a **genre** chip row to the context bar following the exact
  `kind` filter pattern (`context-bar.tsx:22-27`, `pick.ts` SessionContext) —
  a filter, not a scored component.

## WS4 — Session capture workflow

Today's wrap-up captures attendance checkboxes and a recap that **overwrites
the planning notes** (same `events.notes` column —
`src/server/events.ts:219-227` vs `create-event-form.tsx:83`), plus optional
"same time next week." Nothing records what was played, how it went, or
progress; session number lives only in the title string; the dashboard
activity feed never shows completed sessions.

Schema (migration 0012, purely additive, on `events`; 1 event = 1 session so
no new table):
- `recap text` — post-session write-up; **stops the notes overwrite** (fix
  `recordAttendance` to write `recap`, leave `notes` as planning notes).
- `how_it_went smallint` — nullable 1–5 group rating, chips in the wrap-up UI.
- `progress_note text` — nullable "where we left off" (most valuable for
  campaigns; shown on the game detail page).

Flow changes (`event-card.tsx:163-206` wrap-up form + `recordAttendance`):
- Add: game confirm/select (defaulting to `event.gameId`, editable — captures
  "what was actually played" when plans changed), rating chips, recap
  textarea (now → `recap`), progress textarea, keep attendance +
  same-time-next-week.
- Display: past-events section and the WS3 detail page show recap + rating;
  add completed-session rows to the dashboard activity feed
  (`src/server/dashboard.ts:135-158` currently only merges status transitions
  + newly scheduled events).
- Nice-to-have if cheap: promote session number from title-regex
  (`bumpSessionNumber`, `events.ts:88-92`) to a real `session_number` column
  populated by `cloneEventForward` — decide during implementation; not
  required for the capture goals.

## WS5 — Additional data providers

Priority order (owner intent: "at least load the TTRPG image"):
1. **TTRPG/board-game images: already 90% solved.** `bgg.ts` returns
   `coverUrl` for RPG items and board games alike (`bgg.ts:148-158`), and the
   tabletop propose form has a manual `coverUrl` field that wins over the
   fetch (`games.ts:292`). The only breakage is main's Steam-only
   `next/image` allowlist — **fixed by WS0's wildcard `remotePatterns`.**
   Verify a BGG-proposed TTRPG shows its cover on card + detail page.
   **DriveThruRPG: deferred** — no public API; scraping would repeat the HLTB
   fragility mistake (see DECISIONS on manual-first TTRPGs). The manual cover
   field covers it.
2. **RAWG provider first, IGDB later.** RAWG is a simple API-key REST API;
   IGDB requires a Twitch OAuth client-credentials exchange (two secrets +
   token refresh) — more moving parts for similar coverage. New
   `src/lib/metadata/rawg.ts` implementing `GameMetadataProvider`
   (`types.ts:48-53`), keyed via request-scoped env like `bgg.ts` `apiToken()`
   (`:23-37`; no key → provider skipped, degrade like BGG). Wire as a
   **video-path supplement** in `fetchGameMetadata` (`index.ts:50-78` — fill
   art/genres/description only when Steam failed or fields are missing;
   Steam stays canonical) and into `searchGameCandidates`
   (`metadata-search.ts:49-52`) so keyless Steam search failures still get
   candidates. Extend `metadataSource` pgEnum append-only (`schema/games.ts:30`
   + migration), `PROVIDER_LABELS` (`propose-form.tsx:31`), and cover hosts
   (moot with the wildcard). Document `RAWG_API_KEY` in `.dev.vars.example`.

## WS6 — Documentation refresh

Audit result: docs are current through Phase 12; the gaps are specific:
- `docs/ARCHITECTURE.md`: add **Tags** (`tags`/`game_tags`, migration 0004)
  and **`game_vote_milestones`** (0006) sections; add
  `game_metadata.last_refresh_attempt_at` (0005) to the metadata table
  description; cite migration numbers 0003–0011 (+ new 0012) where each
  feature is described.
- `docs/ROADMAP.md`: note migration 0009 in Phase 8; append this batch as new
  phase entries (13: bug fixes + burn-rate periods; 14: explore/detail/
  completion; 15: session capture; 16: providers) when they ship.
- `docs/DECISIONS.md`: add missing ADRs for tags and vote milestones; new
  ADRs from this batch — self-approval rule, burn-rate period model
  (URL+cookie, weekly regression), session capture shape (columns on events,
  no sidecar), RAWG-before-IGDB, mood-as-tags deferral.
- `CLAUDE.md`: schema-domain list add `availability` + `tags`; mention the two
  crons.
- Deployment guide: fix issue **#6** (stale repo URL + `cd stooge-log-mega-branch`
  leftover in 02-set-up-your-computer.md) and issue **#5** (PowerShell
  execution-policy callout in the Node.js install section).

## WS7 — Product evaluation (written deliverable)

Produce `docs/EVALUATION-2026-07.md`: a walkthrough of the full loop
(propose → vote/pick → schedule → play → wrap up → burn rate) with friction
points and missing features. Seed findings from this recon (to be validated
by actually driving the app in preview):
- Completion buried behind the Manage expander; no game detail surface (WS3).
- Wrap-up recap silently destroys planning notes (WS4).
- No genre/type browsing on backlog despite the data existing (WS3).
- Session knowledge (what happened, progress) evaporates (WS4).
- New members get no orientation — issue **#13** (first-time tutorial):
  evaluate a lightweight first-visit dismissible walkthrough card vs a full
  tour; recommend, don't build, in this batch.
- Avatar bug #7, HLTB fragility, BGG-cover breakage — all fixed by WS0/WS1.
- No per-user preferences home (accepted: cookie pattern for now).
- Vote anonymity vs self-approval trade-offs now documented.
- Open questions to put to the group: should completed-game history feed a
  "year in review"? Is `/vote` (still redirecting) removable? Does the group
  want event reminders beyond Discord?

## Verification (every workstream)

- `npm run typecheck && npm run lint`, then **`npm run preview`** (workerd —
  `npm run dev` under Node won't catch Workers-only breakage; CLAUDE.md
  gotcha). Migrations: `npm run db:generate`, review SQL, `npm run db:migrate`
  — never hand-edit; enum changes append-only.
- Invariant checks per change: vote anonymity (no per-user vote reads), stored
  points / burn-rate stability (WS2 only re-buckets history for display — no
  stored values change), all status changes via `transitionGameStatus`
  (WS1c/WS3a reuse it).
- Manual flows: past-date + non-15-minute event rejected with field errors
  (both forms + GAC); proposer sees no "Add to backlog" on own proposal and
  the server rejects a forged request; burn-rate toggle switches series and
  survives revisit via cookie; a BGG TTRPG cover renders on card + detail;
  wrap-up captures rating/recap/progress without clobbering notes; HLTB
  typeahead returns times again (verify in an egress-open environment).
