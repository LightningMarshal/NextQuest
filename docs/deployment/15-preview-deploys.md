# 15 — Preview deploys for pull requests (optional, for people changing the code)

> [!NOTE]
> Skip this unless you (or a helper) change NextQuest's code through GitHub
> pull requests. Day-to-day running of the app doesn't need it.

`npm run dev` runs the app on your computer in ordinary Node. The live app
runs on Cloudflare's own runtime, which behaves slightly differently — the
occasional change works locally and breaks live. A **preview deploy**
closes that gap: for every pull request, GitHub builds the change and
uploads it to Cloudflare as a *version* with its own address, **without
making it the live site**. You click around the preview, and only then
merge.

It's switched off until you opt in.

## Read this first: previews use your real data

A preview version runs with the same secrets as the live app. That means:

- it shows your group's real sessions and library, and **anything you do
  there is real** — RSVPs count, Discord cards get posted;
- a pull request that changes the database's structure will misbehave in
  preview, because structure changes are only applied by `npm run deploy`.

So: use previews to *look* at a change. Don't use them to try anything you
wouldn't do on the live site.

## Turn it on

1. **Create a Cloudflare API token.** Cloudflare dashboard → your profile
   (top right) → **API Tokens** → **Create Token** → use the **Edit
   Cloudflare Workers** template → continue to the end and copy the token.
2. **Find your Account ID.** Cloudflare dashboard → **Workers & Pages** →
   it's in the right-hand sidebar.
3. **Add both to GitHub.** In your repository: **Settings → Secrets and
   variables → Actions**.
   - On the **Secrets** tab, add `CLOUDFLARE_API_TOKEN` and
     `CLOUDFLARE_ACCOUNT_ID`.
   - On the **Variables** tab, add `PREVIEW_DEPLOYS` with the value `true`.
4. **Make sure preview addresses are enabled.** Cloudflare dashboard →
   **Workers & Pages → next-quest → Settings → Domains & Routes** →
   **Preview URLs** → on.

## Using it

Open a pull request. A **Preview** check runs next to the usual ones; when
it finishes, click it and open **Summary** — the preview address is there.
Each new push to the pull request replaces the preview.

The live site isn't touched until you merge and run `npm run deploy`.

## Turning it off

Set the `PREVIEW_DEPLOYS` variable to anything else (or delete it). The
check stops running.

> [!WARNING]
> Pull requests from forks never get a preview — GitHub doesn't hand
> secrets to code from outside your repository, which is what you want.

---

← [14 — Backups and logs](14-backups-and-logs.md) · [Back to the guide's start](README.md)
