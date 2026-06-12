# 10 — Updating the app

When the code changes — new features, fixes — updating your deployment is
a five-command routine. Your data is safe throughout: the database lives
in Neon, completely separate from the code you're replacing
([the shape of the thing →](01-what-you-are-about-to-do.md#the-shape-of-the-thing)).

## The routine

From the project folder:

**All platforms**

```bash
git pull
npm install
npm run db:migrate
npm run preview
npm run deploy
```

What each step does and what to expect:

1. **`git pull`** — downloads the new code. If it complains about local
   changes you didn't knowingly make, ask whoever maintains your copy of
   the repo before forcing anything.
2. **`npm install`** — picks up any changed dependencies. Quick when
   nothing changed.
3. **`npm run db:migrate`** — applies any **new** migrations the update
   shipped ([what's a migration? →](01-what-you-are-about-to-do.md#what-is-a-migration)).
   Safe to run every time: it skips everything already applied, and "no
   migrations to apply" is a normal outcome. Never skip this step — new
   code that expects a new table will crash without it.
4. **`npm run preview`** — the dress rehearsal under Cloudflare's runtime
   ([chapter 07](07-run-it-on-your-computer.md#dress-rehearsal-under-the-real-runtime)).
   Check the local URL it prints renders, then <kbd>Ctrl</kbd>+<kbd>C</kbd>.
5. **`npm run deploy`** — pushes the new version live. Friends mid-page
   aren't kicked off; new requests just get the new version.

> [!NOTE]
> **Secrets persist across deploys.** You do not re-enter anything from
> chapter 08 — deploying replaces the code, not the configuration.

## Occasional maintenance

- **Rotating a leaked secret**: re-run the matching
  `npx wrangler secret put NAME` (chapter 08) with a new value — takes
  effect immediately. For the Google Client Secret, generate the new value
  in the Google Cloud console (Credentials → your client) first; for the
  Discord webhook, create a fresh one in Discord (chapter 06).
- **Adding a friend as admin**: don't touch `ADMIN_EMAILS` for this — it
  only affects accounts that have never signed in. Use **Admin → Make
  admin** in the app.
- **A new friend can't sign in at all**: if you chose "test users" mode in
  [chapter 05](05-google-sign-in.md#configure-the-consent-screen), add
  their Gmail to the test-user list.

## Rolling back

If an update breaks something, Cloudflare keeps previous versions:
dashboard → **Workers & Pages** → **stooge-log** → **Deployments** → pick
the previous deployment → **Rollback**.

> [!WARNING]
> Rollback restores the *code*, not the database — migrations are not
> undone. Rolling back across an update that shipped migrations usually
> still works (old code ignores new tables), but treat rollback as a
> stopgap while the actual problem gets fixed, not a way to live on an old
> version.

---

[← 09 — After you deploy](09-after-you-deploy.md) · [Index](README.md) · Next: [11 — Troubleshooting →](11-troubleshooting.md)
