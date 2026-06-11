# 03 — Cloudflare

Cloudflare is where the app will actually run
([what's a Worker? →](01-what-you-are-about-to-do.md#what-is-a-cloudflare-worker)).
In this chapter you create the account, pick your free web address, log
the command-line tool into it, and **predict your app's final URL** —
chapters 05 and 08 depend on that prediction.

## Create the account

1. Go to [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
2. Sign up with your email and a password.
3. Cloudflare sends a **verification email** — click the link in it.
   (Do verify: some features stay locked on unverified accounts.)
4. You land on the dashboard. If it offers to walk you through adding a
   website or domain, skip it — you don't need a domain.

The free plan is all this guide needs; you never have to enter a credit
card.

## Pick your workers.dev subdomain

Your app's address will be built from a **subdomain** you register once
for the whole account.

1. In the dashboard's left sidebar, find **Workers & Pages** (if you don't
   see it, use the search box at the top and search for "Workers").
2. The first time you visit, Cloudflare prompts you to **register a
   workers.dev subdomain** — a short name like `mike-pond` or
   `stooge-squad`. If you're not prompted, look for **"Your subdomain"**
   on the Workers & Pages overview page (usually in a panel on the right),
   where you can set or see it.

> [!WARNING]
> Choose carefully: the subdomain is visible in your app's address and
> changing it later breaks every link and the Google sign-in setup you're
> about to do. Lowercase letters, numbers, and hyphens.

## Predict your app's URL

The project's Worker is named `stooge-log` (set in the repo's
`wrangler.jsonc` — don't change it). Cloudflare composes addresses as
`https://<worker-name>.<your-subdomain>.workers.dev`, so your app's
address **will be**:

```
https://stooge-log.<your-subdomain>.workers.dev
```

For example, with the subdomain `mike-pond`:

```
https://stooge-log.mike-pond.workers.dev
```

You'll register this address with Google in chapter 05 and store it as a
setting in chapter 08 — both *before* the app exists at that address.
That's fine: the address is fully determined by the worker name + your
subdomain, and chapter 08 has a checkpoint to confirm the prediction (and
a two-minute fix if it ever differs).

> [!WARNING]
> Never rename the worker in `wrangler.jsonc`. Beyond changing the URL,
> the config contains a `WORKER_SELF_REFERENCE` binding whose `service`
> value must equal the worker name — it's how the scheduled jobs call the
> app — and renaming one without the other silently breaks reminders.

## Log the command-line tool in

**wrangler** is Cloudflare's command-line tool (it ships with the
project's dependencies — nothing extra to install). Connect it to your new
account:

**All platforms**

```bash
npx wrangler login
```

A browser tab opens asking you to log in (if you aren't) and then to
**authorize Wrangler** — click **Allow**. Back in the terminal you should
see a success message. Verify:

**All platforms**

```bash
npx wrangler whoami
```

It should print the email of your Cloudflare account.

> [!NOTE]
> If the browser doesn't open by itself (common on Linux or over remote
> connections), wrangler prints the URL — copy it into a browser manually.
> See [troubleshooting #12](11-troubleshooting.md#12-npx-wrangler-login-hangs-or-cant-open-a-browser).

## Write this down

> [!IMPORTANT]
> In your scratch note, record:
>
> - **Your subdomain**: `___________.workers.dev`
> - **Your app's predicted URL**:
>   `https://stooge-log.<your-subdomain>.workers.dev`
>   — copy it out in full, with no trailing slash. You will paste it,
>   character-for-character, in chapters 05 and 08.

---

[← 02 — Set up your computer](02-set-up-your-computer.md) · [Index](README.md) · Next: [04 — Neon database →](04-neon-database.md)
