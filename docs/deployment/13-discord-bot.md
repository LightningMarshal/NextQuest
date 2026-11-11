# 13 — The Discord bot: "I'm in" buttons on session cards (optional)

> [!NOTE]
> **Optional, and you can add it any time.** Webhooks
> ([chapter 06](06-discord-notifications.md)) already post a card for every
> session. The bot posts the *same* card, with three buttons under it —
> **I'm in**, **Maybe**, **Out** — so people join without leaving Discord.
> Webhooks can't carry buttons; only a bot can.

What changes for your group:

- A session card in Discord has buttons. Pressing one RSVPs you, and the
  card updates itself a second later, exactly as it does when someone RSVPs
  on the website.
- Only the person who pressed sees the reply ("✅ You're in for Rust").
- The first time someone presses a button, the bot may not know who they
  are. It replies (privately) with a link to connect their Discord account
  to NextQuest. They do that once.
- The rules are the website's rules: guests can only join **open**
  sessions, a full session says it's full, a finished one is closed.

You need: the app already deployed ([chapter 08](08-deploy.md)), and to be
an admin of the Discord server.

## 1. Open your Discord application

If you set up **Discord sign-in** in chapter 06, you already have an
application — use that one. The bot and the sign-in button share it.

1. Go to <https://discord.com/developers/applications> and sign in.
2. Click your NextQuest application (or **New Application**, name it
   `NextQuest`, and create it).

> [!IMPORTANT]
> The "connect your Discord account" step needs Discord sign-in to be set
> up: `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` from
> [chapter 06](06-discord-notifications.md#optional-discord-sign-in-for-your-wider-circle).
> If you skipped that, do it first — otherwise only people who originally
> signed in *with Discord* can use the buttons.

## 2. Copy two values

1. On **General Information**, find **Public Key** and click **Copy**.
   This is not a secret, but the app needs it: it's how NextQuest proves a
   button press really came from Discord.
2. On the **Bot** page, click **Reset Token**, confirm, and **Copy** the
   token it shows. You only see it once.

> [!WARNING]
> The bot token is a password. Anyone who has it can post as your bot.
> Never paste it into a chat or commit it. If it leaks, press **Reset
> Token** again — the old one stops working immediately.

You don't need to switch on any of the "Privileged Gateway Intents" on the
Bot page. Leave them off.

## 3. Give both values to your deployed app

In a terminal, in the project folder:

**All platforms**

```bash
npx wrangler secret put DISCORD_BOT_TOKEN
```

Paste the token when asked, press Enter. Then:

**All platforms**

```bash
npx wrangler secret put DISCORD_PUBLIC_KEY
```

Paste the Public Key, press Enter. Secrets take effect within a few
seconds — no redeploy needed.

## 4. Tell Discord where your app is

Back in the developer portal, on **General Information**:

1. Find **Interactions Endpoint URL**.
2. Enter your app's address followed by `/api/discord/interactions`:

   ```
   https://next-quest.YOUR-SUBDOMAIN.workers.dev/api/discord/interactions
   ```

3. Click **Save Changes**.

Discord tests the address on the spot. If it saves, you're connected.

> [!WARNING]
> **"The specified interactions endpoint url could not be verified"** means
> the app didn't answer the test correctly. Almost always one of:
> the Public Key secret is missing or was pasted with a stray space (redo
> step 3); the URL has a typo; or you did step 4 before step 3.

## 5. Invite the bot to your server

1. In the developer portal, open **OAuth2** → **URL Generator**.
2. Under **Scopes**, tick **bot** and **applications.commands** (the
   second one is for the slash commands in step 8).
3. Under **Bot Permissions**, tick **View Channels**, **Send Messages**,
   and **Embed Links**. (Add **Send Messages in Threads** if you want cards
   in a thread.)
4. Copy the generated URL at the bottom, open it in your browser, choose
   your server, and **Authorize**.

If the channel you want is private, also add the bot to that channel
(channel settings → **Permissions** → add the NextQuest bot).

## 6. Add the channel in NextQuest

1. In Discord, turn on **Developer Mode** (User Settings → **Advanced**).
2. Right-click the channel → **Copy Channel ID**.
3. In NextQuest, open **Admin → Discord bot**, give the channel a name,
   paste the ID, choose *Everything* or *Open sessions only*, and click
   **Add channel**.

A hello message appears in the channel straight away. If NextQuest shows an
error instead, it tells you what Discord objected to — usually the bot
isn't in the server yet, or can't post in that channel.

> [!IMPORTANT]
> **One or the other per channel.** If that channel also has a webhook
> (Admin → Discord), remove the webhook — otherwise every session gets two
> cards there. Cards the webhook already posted stay where they are; they
> just stop updating.

## 7. Try it

Post a session. The card appears with buttons. Press **I'm in**:

- If you signed in to NextQuest with Discord, it just works.
- If you signed in with Google, the bot replies with a link to
  **Connect Discord**. Follow it, click the button, approve — then press
  **I'm in** again. That's a one-time step per person.

## 8. Slash commands (optional)

Two commands people can type in any channel the bot can see:

- **`/sessions`** — what's coming up, with links. Only the person who typed
  it sees the answer, and it's *their* list: guests see open sessions only.
- **`/post`** — a member posts a session without opening the website: pick
  the game (it suggests titles from your library as you type), when it
  starts, and optionally whether it's open to guests, a seat limit, and a
  note. The card appears in your channels like any other session.

To switch them on: **Admin → Discord bot → Set up slash commands**. Press it
once. Discord can take a few minutes to show them; restarting the Discord
app usually makes them appear at once. Press it again after you update
NextQuest, in case the commands changed.

> [!NOTE]
> **Why `/post` only offers "Now", "In 30 minutes", "In 1 hour"…** Discord
> doesn't tell a bot what timezone you're in, so "8pm" typed into Discord
> would be a guess — and a session at the wrong hour is worse than none.
> "In an hour" means the same thing for everyone. For a specific day and
> time, post on the website; the bot's reply also links straight to the
> new session's edit page.

> [!IMPORTANT]
> If the commands never show up, the bot was probably invited without
> permission to add them. Repeat [step 5](#5-invite-the-bot-to-your-server),
> ticking **applications.commands** as well as **bot** under Scopes, and
> authorize again — you don't need to remove the bot first.

## If something's off

| What you see | Why | Fix |
| --- | --- | --- |
| "NextQuest is thinking…" for a few seconds | The database was asleep and is waking up (normal after a quiet day) | Nothing — the answer arrives by itself |
| "This interaction failed" under the button | Discord couldn't reach the app | Check the Interactions Endpoint URL (step 4); look at the logs ([chapter 14](14-backups-and-logs.md)) |
| Buttons work but the card never appears for new sessions | The channel is paused or removed in Admin, or the bot lost permission | Admin → Discord bot → **Test** on the channel |
| "That session isn't available to you" | A guest pressed a button on a members-only session | Working as intended |
| Everyone gets "connect your Discord" every time | Discord sign-in isn't configured, so connecting can't complete | Set `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` (chapter 06) |
| Two cards per session | A webhook and the bot both post to that channel | Remove the webhook |
| `/sessions` and `/post` don't appear when typing `/` | Not switched on yet, Discord hasn't refreshed, or the bot lacks the commands permission | Admin → **Set up slash commands**; restart Discord; see the note in step 8 |
| "Posting sessions is for group members" | A guest ran `/post` | Working as intended |

To turn the bot off entirely, remove its channels in Admin (or delete the
`DISCORD_BOT_TOKEN` secret). Webhooks keep working either way.

---

← [12 — Upgrading to the redesign](12-redesign-migration.md) · Next: [14 — Backups and logs →](14-backups-and-logs.md)
