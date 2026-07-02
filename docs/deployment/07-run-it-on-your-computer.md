# 07 — Run it on your computer

Before deploying, you'll run the app locally. This is where mistakes are
cheap: a mistyped connection string or Google credential fails *here*,
with a readable error on your own machine, instead of silently breaking
the live site. You'll need your scratch note from chapters 03–06.

All commands below run in a terminal **inside the project folder** (the
one you `cd`-ed into in chapter 02).

## Create the two settings files

The app reads its settings from local files that you create by copying the
provided examples
([why two files? →](01-what-you-are-about-to-do.md#what-is-an-environment-variable-what-is-a-secret)):

**Windows (PowerShell)**

```powershell
Copy-Item .dev.vars.example .dev.vars
Copy-Item .env.example .env
```

**macOS**

```bash
cp .dev.vars.example .dev.vars
cp .env.example .env
```

**Linux**

```bash
cp .dev.vars.example .dev.vars
cp .env.example .env
```

> [!NOTE]
> Both new files may be invisible in your file manager (names starting
> with a dot are hidden by convention). Your code editor will show them —
> open the project folder in any editor (e.g.
> [VS Code](https://code.visualstudio.com/): **File → Open Folder**), or
> edit from the terminal with `notepad .dev.vars` (Windows) /
> `nano .dev.vars` (macOS/Linux).
>
> They're also deliberately ignored by git — they hold secrets and will
> never be uploaded anywhere.

## Fill in `.dev.vars`, line by line

Open `.dev.vars` in your editor. It contains the lines below (plus
comments starting with `#`, which you can leave alone). Go through each
one:

### `NEXTJS_ENV=development`

Leave exactly as is. (Local-only switch; it never goes to production.)

### `DATABASE_URL=`

Replace the placeholder string with **your Neon connection string** from
chapter 04 — the whole `postgresql://…?sslmode=require` line, with
`-pooler` in the hostname. No quotes, no spaces.

### `BETTER_AUTH_SECRET=`

A random key the app uses to sign session cookies (the proof that a
browser is logged in). Generate one:

**All platforms**

```bash
npx @better-auth/cli secret
```

It prints a long random string — paste it after the `=`. This may take a moment to generate, so don't panic if it seems like nothing is happening. Also copy it into
your scratch note (you'll reuse or regenerate it in chapter 08).

### `BETTER_AUTH_URL=http://localhost:3000`

Leave as is **for now**. This must always equal the address the app is
being used at; on your computer that's `http://localhost:3000`. The
production value is set separately in chapter 08.

### `GOOGLE_CLIENT_ID=` and `GOOGLE_CLIENT_SECRET=`

Paste the **Client ID** and **Client Secret** from chapter 05, one per
line.

### `ADMIN_EMAILS=`

> [!IMPORTANT]
> Put **your own** Google account email here (the one you'll sign in
> with). Multiple admins: separate with commas, no spaces —
> `you@gmail.com,cofounder@gmail.com`.

This is the first-admin bootstrap
([the approval model →](01-what-you-are-about-to-do.md#the-approval-model)):
emails on this list skip the approval queue and arrive as admins — but
**only on their very first sign-in**. If you sign in before fixing this
line, you'll be stuck at "pending approval" with no admin to approve you
(rescue procedure:
[troubleshooting #8](11-troubleshooting.md#8-you-the-deployer-are-stuck-on-pending-approval)).

### `DISCORD_WEBHOOK_URL=`

Paste the webhook URL from chapter 06 — or leave empty to disable
notifications.

### `CRON_SECRET=`

A password of your choosing that guards the scheduled-jobs endpoint
([what's a cron job? →](01-what-you-are-about-to-do.md#what-is-a-cron-job)).
Generate a random one:

**All platforms**

```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

(macOS/Linux alternative: `openssl rand -hex 16`.)

Paste the output after the `=`, and into your scratch note. You may also
leave it empty — the app runs fine, but reminders and the metadata refresh
stay off until you set it.

## Fill in `.env`

Open `.env`. It has a single setting: `DATABASE_URL`. Paste **exactly the
same Neon connection string** you put in `.dev.vars`.

> [!WARNING]
> The two files must stay in sync on `DATABASE_URL`. `.env` is read only
> by the database tooling (the migrate command below); `.dev.vars` by the
> running app. If they point at different databases you get the deeply
> confusing "migrations ran fine but the app says tables don't exist"
> ([troubleshooting #6](11-troubleshooting.md#6-migrations-ran-but-the-app-cant-find-tables)).

## Build the database tables

Time to turn the empty Neon database into NextQuest's structure
([what's a migration? →](01-what-you-are-about-to-do.md#what-is-a-migration)):

**All platforms**

```bash
npm run db:migrate
```

Expected: a few lines of output ending in something like
`migrations applied successfully!`. It applies the 7 numbered scripts in
the `drizzle/` folder in order. If it fails with a network or
authentication error, the string in `.env` is wrong — see
[troubleshooting #5](11-troubleshooting.md#5-npm-run-dbmigrate-fails).

Optional: peek at the result with **All platforms** `npm run db:studio` —
it prints a local URL that opens a database browser; you should see empty
tables named `games`, `votes`, `events`, `user`, and friends. Stop it with
<kbd>Ctrl</kbd>+<kbd>C</kbd> when done.

## First run

**All platforms**

```bash
npm run dev
```

After a few seconds it prints `Local: http://localhost:3000`. Open that in
your browser:

1. You should see the NextQuest sign-in page.
2. Click **Continue with Google** and sign in with the email you put in
   `ADMIN_EMAILS`.
3. You should land on the **dashboard** — and because of the bootstrap,
   your account menu (top right) includes **Admin**.

This single sign-in just proved your database string, both Google
credentials, the `localhost` redirect URI, and the admin bootstrap all
work. If it failed instead, the error names the culprit — match it against
[troubleshooting](11-troubleshooting.md) entries 1, 4, and 8.

Stop the app with <kbd>Ctrl</kbd>+<kbd>C</kbd> in the terminal.

## Dress rehearsal under the real runtime

`npm run dev` runs the app under Node.js — fast and friendly, but **not**
what Cloudflare uses. The deployed app runs under Cloudflare's runtime
(`workerd`), which is stricter. This command builds the app exactly as the
deploy will and runs it under that real runtime:

**All platforms**

```bash
npm run preview
```

This takes noticeably longer (it's a full production build), then prints
`Ready on http://localhost:8787`. Open that URL and check pages render
(the sign-in page is enough).

> [!NOTE]
> Don't bother signing in under preview: it runs on port 8787, which isn't
> one of your registered Google redirect URIs, so sign-in there would fail
> by design. Rendering pages without errors is the test. Stop it with
> <kbd>Ctrl</kbd>+<kbd>C</kbd>.

If `preview` works, the deploy in the next chapter will too.

---

[← 06 — Discord notifications](06-discord-notifications.md) · [Index](README.md) · Next: [08 — Deploy →](08-deploy.md)
