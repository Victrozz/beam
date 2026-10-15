# Beam

Tiny files, photos, text and links between Windows laptops and phones, yours and your friends'.

## Got an invite?

1. Open the invite link on your **Windows laptop**. It explains everything and has a **Download Beam** button (or grab **Beam-Setup.exe** from [Releases](https://github.com/Victrozz/beam/releases/latest)).
2. Run `Beam-Setup.exe`. If Windows says *"Windows protected your PC"*, click **More info → Run anyway**. Beam isn't signed with a paid certificate, that's all.
3. Setup asks for the invite link, your name, and then shows a QR code to connect your phone. About two minutes.

Your phone doesn't install anything from a store: Beam on the phone is a web app you add to your Home Screen (setup walks you through it). Notifications work on iPhone (iOS 16.4+) and Android.

## Using it

**Laptop → phone or friend**
- Press **Ctrl+Alt+B** (or click the tray icon). The Beam panel opens at the bottom right.
- Pick who gets it with the buttons under the drop zone: **My phone**, or a friend's **laptop** or **phone**.
- Drop files or folders on it, press **Ctrl+V** to paste a file, screenshot or text, or click the drop zone to browse. Folders are zipped.
- Or right-click a file → **Send to → My phone (Beam)** / **Diego's laptop (Beam)** / … On Windows 11 that's under *Show more options*.

**Phone → laptop or friend**
- In Beam on the phone: **Send** tab → pick who gets it at the top → photos, files, **Paste**, **Text** or **Camera**.
- From any app's Share button: set it up once in **Settings → Add Beam to the Share button** (iPhone).

**Receiving**
- You get a notification saying who it's from. Text is copied to the clipboard automatically. Files stay in Beam until you **drag them out**, **Copy** them (then Ctrl+V anywhere), **Save to Downloads** or **Open** them.

**Friends**
- Everyone on your Beam server is a friend. To add someone: Beam → **Settings → Invite a friend** (or the **Invite a friend** button under the drop zone). It copies a link that works once, for 14 days. Send it to them.
- Change your name in **Settings → Your name**.
- New phone or second laptop? **Settings → Pair a phone → Show code**. A laptop's setup accepts that 6-digit code too ("Already use Beam on another device?").

## How it works

```
 Beam.exe (Electron, tray) ──HTTPS──▶ Cloudflare Worker + Durable Object (free) ──Web Push──▶ phone web app
         ▲                              accounts, invites, items for 24 h (SQLite)               │
         └───── WebSocket (polling fallback) ◀──────────────────── HTTPS / iOS Shortcut ◀────────┘
```

| folder | what |
|---|---|
| `server/` | Cloudflare Worker: API, accounts and invites (`src/index.js`), push notifications (`src/push.js`), the phone web app and the invite page (`public/`) |
| `desktop/` | Windows app: `main.js` (tray, hotkey, send queue, receiving, setup), `ui/panel.*` (the panel), `ui/setup.*` (first-run setup), `build/` (installer hooks) |

Every account has its own tokens (one per device, stored hashed). Items are addressed to a person and a device (`laptop` or `phone`) and are deleted from the server 24 hours after they're sent. On the laptop, everything lives in `%LOCALAPPDATA%\Beam`: `config.json` (server + sign-in), `Inbox\` (received files, kept 30 days) and `history.json`. The app itself installs to `%LOCALAPPDATA%\Programs\Beam`, no admin rights needed.

## Running your own server

1. `cd server`, `npm install`, then `npx wrangler deploy`.
2. Set a long random key: `npx wrangler secret put TOKEN`. That key is the first account (yours). Optionally deploy once with `--var OWNER_NAME:YourName` to name it.
3. In `desktop/package.json` set `beamServer` to your worker's URL, and in `server/public/join.js` point `DOWNLOAD` at your own releases.
4. Build and install on your laptop: `powershell -ExecutionPolicy Bypass -File desktop\install.ps1`. In setup, paste your `TOKEN` as the invite to sign in as the owner. Then invite friends from Settings.

## Releasing

- Server or phone app: `cd server`, then `npx wrangler deploy`.
- Windows app: bump `version` in `desktop/package.json`, then push a tag like `v3.1.1`. GitHub Actions builds `Beam-Setup.exe` and attaches it to the release with `latest.yml`. Installed copies (3.1.0 and later) check every 6 hours, download it in the background and install it silently the next time Beam is idle (panel closed, nothing sending), then start again. Settings → About shows the status and has **Check now** / **Restart now**. Invite links always download the latest setup, and running it over an old install keeps your sign-in and history.
- Tests: `cd server && npm test` (push encryption vs the RFC 8291 vector), and with `npx wrangler dev` running, `node test/friends.test.mjs` (accounts, invites, pairing, sending between friends).

## When things go wrong

| You see | What it means |
|---|---|
| **Connected (slow)** in the panel | The network blocks live connections. Beam checks every 20 s instead. |
| **not notified** on a sent item | That phone has notifications off. Open Beam on the phone → Settings → Turn on. |
| **waiting** on a sent item, or **Laptop offline** on the phone | Items wait on the server for up to 24 h and arrive when the laptop is back. |
| **Failed · …** on an item | Hover it and click retry. Sends interrupted by shutting down are marked failed too. |
| Hotkey doesn't work | Another app took it. Change it in Beam → Settings → Shortcut. |
| Invite says expired | Invites work once, for 14 days. Ask for a new one. |
