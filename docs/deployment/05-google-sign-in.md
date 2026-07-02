# 05 — Google sign-in

The app's only way to log in is **Sign in with Google**
([how does that work? →](01-what-you-are-about-to-do.md#what-is-sign-in-with-google-oauth)),
so this chapter is mandatory. You'll create a (free) Google Cloud project
and come away with three things: a **Client ID**, a **Client Secret**, and
two registered **redirect URIs**.

> [!NOTE]
> The Google Cloud console is by far the most intimidating website in this
> guide — it's built for large companies and has hundreds of products.
> You need exactly one small corner of it. When lost, use the **search bar
> at the top of the console**: every page named below can be found by
> typing its name there.

You'll need your **predicted app URL** from
[chapter 03](03-cloudflare.md#predict-your-apps-url).

## Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and
   sign in with your Google account. Accept the terms of service prompt.
2. At the top of the page is a **project picker** (it may say "Select a
   project" or show a default project name). Click it, then **New
   project**.
3. Name it `next-quest` (no organization needed), click **Create**, and
   wait for the notification that it's done. Make sure the picker now
   shows `next-quest` — everything you do next must happen *inside* this
   project.

## Configure the consent screen

The consent screen is what your friends see the first time they sign in
("NextQuest wants to access your Google Account…").

1. In the console search bar, search for **"OAuth consent screen"** and
   open it. (Google has been reorganizing this area — it may live under a
   product called **Google Auth Platform**. Same screens either way. If
   it asks you to click **Get started** to configure branding first, do
   that — the questions are the same ones below.)
2. Fill in the basics:
   - **App name**: `next-quest` (your friends see this).
   - **User support email**: your email.
   - **Audience / User type**: **External**. ("Internal" is only for
     companies with Google Workspace.)
   - **Developer contact email**: your email again.
3. Save/continue through the remaining steps. You do **not** need to add
   any scopes (the defaults — basic profile and email — are what the app
   uses) and you can leave optional branding fields empty.

> [!IMPORTANT]
> **Your app starts in "Testing" mode**, and in Testing mode **only people
> you list as test users can sign in** — everyone else gets an
> "Access blocked" error. Pick one of these, now or after you deploy:
>
> - **Option A — add test users**: on the consent screen / Audience page,
>   find **Test users** and add the Gmail address of every friend who will
>   use the app (you can hold up to 100). Simple, private, but you must
>   remember to add each new friend here too.
> - **Option B — publish the app**: click **Publish app** on the same
>   page. Anyone with the link can then *attempt* to sign in — which is
>   fine, because NextQuest has its own approval queue: strangers would
>   just sit at "pending approval" forever. Since the app requests no
>   sensitive scopes, publishing does not require Google's review.
>
> Either works. If a friend ever reports "Access blocked", this is why —
> see [troubleshooting #3](11-troubleshooting.md#3-a-friend-gets-access-blocked-when-signing-in).

## Create the OAuth credentials

1. In the console search bar, search for **"Credentials"** and open the
   Credentials page (under "APIs & Services").
2. Click **+ Create credentials** → **OAuth client ID**.
3. **Application type**: **Web application**.
4. **Name**: `next-quest` (just a label).
5. Under **Authorized redirect URIs**, click **Add URI** twice and enter
   exactly these two (the first lets you sign in while developing on your
   computer; the second is the live app):

   ```
   http://localhost:3000/api/auth/callback/google
   ```

   ```
   https://next-quest.<your-subdomain>.workers.dev/api/auth/callback/google
   ```

   — replacing `<your-subdomain>` with the one from your scratch note, so
   it's your predicted URL plus the path `/api/auth/callback/google`.

> [!WARNING]
> Redirect URIs are matched **character-for-character**. The classic
> mistakes: a trailing slash, `http://` instead of `https://` on the
> production one, a typo in the subdomain, or pasting the bare app URL
> without the `/api/auth/callback/google` path. Any of these makes Google
> show `redirect_uri_mismatch` at sign-in
> ([troubleshooting #1](11-troubleshooting.md#1-google-shows-error-400-redirect_uri_mismatch)).

6. Click **Create**. A dialog shows **Your Client ID** and **Your Client
   Secret**.

## Write this down

> [!IMPORTANT]
> From that dialog, record in your scratch note:
>
> - **Client ID** — long, ends in `.apps.googleusercontent.com`
> - **Client Secret** — starts with `GOCSPX-`
>
> The secret is shown here and retrievable later from the Credentials page
> (click your client's name). Treat the secret like a password.

---

[← 04 — Neon database](04-neon-database.md) · [Index](README.md) · Next: [06 — Discord notifications →](06-discord-notifications.md)
