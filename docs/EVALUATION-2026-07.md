# Product evaluation — July 2026

A walkthrough of NextQuest's end-to-end workflow, the friction in it, and
what's missing. Written after the 2026-07 feature batch
(`docs/plans/2026-07-feature-batch.md`, Phases 13–16); findings are from
reading the codebase, not from watching real users, so treat the UX calls as
hypotheses to confirm against the group. Recommendations are ranked; nothing
here is built.

## The core loop

The app is one loop: **propose → prioritize → schedule → play → wrap up →
see progress**. It holds together well — each stage feeds the next, and the
recent batch closed the biggest gaps. Stage by stage:

### 1. Propose (`/backlog`)

Search-first: type a title, pick a candidate, the server refetches metadata
from the id. Video uses Steam + HLTB (+ RAWG when keyed); tabletop uses BGG
(BoardGameGeek + RPGGeek) or manual entry. Degrades to manual whenever a
provider is down — a broken lookup never blocks a proposal.

- **Strong.** The typeahead + preview + manual fallback is the right shape,
  and tabletop entry (bands/crunch instead of false-precision hours) is
  thoughtful.
- **Friction — HLTB is fragile and probably broken right now.** It scrapes
  HLTB's JS bundle to discover a rotating endpoint; the regexes break when
  the bundle changes. This couldn't be verified or fixed in the build
  environment (no outbound network to howlongtobeat.com). *When HLTB is
  down, video games lose their playtime prefill and land unscored* — the
  proposer must set length by hand. See "Known issues" below.
- **Gap — no way to just add a title you can't find.** Manual entry exists,
  but it's framed as a fallback. For obscure games/systems this is the
  common path, not the exception.

### 2. Prioritize — voting + the picker (`/pick`)

Anonymous budget voting (10 points, ≤4 per game) feeds one *interest* signal
into a composite ranking that also weighs acclaim, time-fit, staleness, and
party-fit against the night's context (hours, commitment, kind, genre,
players).

- **Strong.** The picker is the app's cleverest idea and it's well-built —
  read-time scoring, URL-carried context, admin-tunable weights, anonymity
  preserved. "What kind of night?" + "use next session" is genuinely nice.
- **Friction — two prioritization surfaces.** `/pick` is the tool, but
  `/vote` still exists (redirects) and the backlog also sorts by "Most
  votes". A newcomer won't know whether to think in votes or in the picker.
- **Friction — the picker may be over-featured for the group's cadence.** A
  handful of friends choosing among a dozen games may not need a five-factor
  weighted model; the risk is that the *ranking feels like a black box*
  ("why is this #1?"). The per-component breakdown helps, but consider a
  "why this?" one-liner.

### 3. Schedule (`/events` + GAC)

Create a session (title, optional game, when, duration, location), or run a
"find a time" availability poll and promote the winning slot to an event.
RSVPs, reminders (Discord), and clone-forward "same time next week".

- **Strong.** GAC → event → seeded RSVPs is a complete, coherent flow. The
  batch fixed the real bugs here (past-date crash, 15-minute snapping).
- **Friction — location is one free-text field.** "Discord / the couch / a
  URL" covers everything and structures nothing. There's no
  virtual/in-person signal to filter or badge on, and tabletop `format`
  (virtual/in-person/hybrid) lives on the *game*, not the session, so they
  can disagree. A structured `venue` on events was scoped earlier and
  dropped from this batch — worth revisiting if the group plays both online
  and in person.
- **Gap — no calendar view.** Events are a list. For a group juggling a
  weekly campaign + one-offs, a month grid would read better.

### 4. Play & 5. Wrap up

Wrap-up now captures attendance, a recap, a 1–5 rating, "where we left off",
and *what was actually played* — and (fixed this batch) no longer overwrites
the planning notes.

- **Strong (new).** Session capture was the biggest hole and it's now solid.
  Campaign continuity (progress notes surfaced on the game detail page) is
  exactly what a long D&D game needs.
- **Friction — wrap-up is a chore with no nudge.** A past-dated scheduled
  event silently moves to "Needs wrap-up", but nothing *reminds* anyone to
  actually do it. Recaps will rot unless someone remembers. A Discord nudge
  (the reminder cron already exists) or a dashboard callout would help.

### 6. See progress (`/` dashboard)

Stat cards, the burn-rate chart (now with a per-viewer weekly/monthly/yearly/
all-time toggle), projected completion, "now playing", an activity feed, and
member stats.

- **Strong.** Burn-rate-as-progress is a great framing for a backlog, and
  the period toggle makes it useful across a long history.
- **Friction — the activity feed ignores the payoff.** It shows status
  changes and *newly scheduled* events, but **not completed sessions,
  recaps, or ratings** — the very things the group just captured. Wrapping up
  a great night produces no visible trace on the dashboard. (Called out and
  deferred in WS4.)
- **Gap — no per-member or per-game history page.** Member stats are two
  numbers; the game detail page now has session history, but there's no
  "what have *I* played / rated" view.

## Cross-cutting observations

- **Onboarding is absent (issue #13).** A newly approved member lands on the
  dashboard with no orientation. Given the app has five surfaces (dashboard,
  backlog, pick, events, admin) and two non-obvious concepts (budget voting,
  the picker), this is the highest-leverage missing piece. **Recommendation:**
  *don't* build a full guided tour first — ship a dismissible first-visit
  card on the dashboard ("Welcome — here's the 30-second version: propose
  games, spend your 10 vote points, let the picker suggest tonight's game,
  schedule a session") with links to each surface, persisted dismissed via a
  cookie (the `nq-burn-period` pattern) or a `user` flag. Measure whether
  engagement improves before investing in step-by-step coachmarks.
- **No per-user preferences home.** The burn-rate toggle uses a cookie
  because there's no per-user settings table (single-tenant, `app_settings`
  is global). That's fine for one preference; a second or third (default
  pick context? notification opt-outs?) would justify a small
  `user_preferences` table.
- **Avatar bug (#7) still open.** Google profile pictures fail to load
  (referrer policy) — a one-line fix was diagnosed in the issue and
  deliberately skipped this batch. Small but visible on every page.
- **Vote anonymity is well-guarded** and survived every change this batch —
  worth keeping as a hard invariant in review.

## Missing features, ranked by value

1. **First-visit onboarding** (issue #13) — highest leverage; recommend the
   lightweight card above.
2. **Completed-session activity + a wrap-up nudge** — makes the capture work
   visible and keeps recaps from rotting. Reuses the existing activity feed
   and reminder cron.
3. **Fix HLTB** (or accept manual-first for video) — restores video playtime
   prefill. Needs an egress-capable environment to diagnose; the fix is a
   regex/payload update, documented in the batch plan.
4. **Structured event venue** (virtual/in-person/hybrid) — small, enables
   filtering and honest online/in-person signals.
5. **Avatar fix (#7)** — trivial, visible.
6. **A calendar view for events** — quality-of-life for busy groups.
7. **A "year in review" / history surface** — the burn-rate + ratings data
   is there; a periodic recap could be a fun group artifact.

## Known issues & technical debt (from this batch)

- **Migrations 0012 (session capture) and 0013 (RAWG enum) are unapplied.**
  They were generated and committed but `db:migrate` needs a live
  `DATABASE_URL` — run it before/at deploy.
- **RAWG is unexercised.** Gated to a no-op without `RAWG_API_KEY`; the
  provider code mirrors the proven HLTB/BGG id-threading but has never hit
  the real API here. Verify against a keyed preview before relying on it.
- **HLTB fix ported, unverified.** `hltb.ts` was updated to HLTB's current
  endpoint-discovery + `/api/<seg>/init` auth handshake, ported from the
  maintained `howlongtobeatpy` reference (the parsing is unit-checked against
  synthetic bundles; the live handshake couldn't be exercised — howlongtobeat.com
  is egress-blocked). Confirm in a real-internet `npm run preview`; if it fails,
  the localized fix is `fetchAuthToken`'s field mapping.
- **Preview/click-through verification pending.** Every UI change this batch
  passed typecheck/lint/build but was not exercised in a running app (the
  build environment has no database). A `npm run preview` pass against a real
  DB is the outstanding QA step for the whole batch.

## Does the workflow make sense?

Yes — the loop is coherent and, after this batch, mostly complete. The
sharpest remaining edges are **onboarding** (nothing welcomes a new member),
**the invisible payoff** (completed sessions/recaps don't surface on the
dashboard), and **two competing prioritization framings** (votes vs. the
picker vs. backlog sort). None are structural; all are addressable
incrementally. The foundation — single lifecycle, stored effort vs. read-time
ranking, anonymous voting, provider-degradation — is sound and has absorbed a
large feature batch without an invariant breaking.
