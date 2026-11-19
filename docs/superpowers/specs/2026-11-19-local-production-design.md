# Production moves to Cory's PC

Status: draft, awaiting approval. Written 2026-11-19.

## Intent

Production for StatElite leaves Netlify and Supabase's hosted service and runs on Cory's Windows desktop: the web app, the database, sign-in and backups. Cory asked for "everything" to move and chose Cloudflare Tunnel as the way phones reach the PC. Cory has not said why the move is wanted, so nothing here is tuned for cost, privacy or any other single reason.

## What exists today

- Netlify builds `main` to https://stat-elite.netlify.app and `integration` to https://integration--stat-elite.netlify.app (`netlify.toml`: `npm run build`, publish `dist`, one header for the manifest's content type).
- Both deploys talk to one hosted Supabase project (ref `gextmglkwnchywwtccbf`). The app reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` at build time (`src/main.tsx:21`).
- The app uses three Supabase features, all in `src/core/server.ts`: Auth by emailed code (`signInWithOtp`, `verifyOtp`, `getSession`, `signOut`), tables through the REST API, and two RPCs (`accept_invite`, `delete_my_account`). It uses no storage, edge functions or realtime.
- The schema is the 13 files in `supabase/migrations/`.
- Sign-in email goes out through Gmail SMTP on `statelite0@gmail.com`, set in the Supabase dashboard. The Magic Link and Confirm signup templates both carry `{{ .Token }}`; the installed app signs in by that code (ADR 0007).
- Production holds real family data (see the hand repair of 2026-11-09).
- The PC: Windows 11 desktop, Docker 29, WSL2 with Ubuntu, 32 GB RAM, 296 GB free on E:, 49 GB free on C:.

## Goals

1. A phone on cellular opens `https://<host>` and gets the same app, served from the PC, with a valid certificate and no warning page.
2. Sign-in by emailed code, sync, Invites and account deletion work as they do today, with no change to `src/`.
3. Every Account, Athlete, Game and Event on hosted production is on the PC after cutover, with the same ids, so ownership and Membership hold.
4. A nightly backup runs without Cory, one copy leaves the PC, and a failed night sends an email.
5. The stack comes back by itself after a reboot once Windows is signed in.

## Non-goals

- No change to app code, the schema or any ADR.
- GitHub and GitHub Actions stay. CI runs on PGlite and needs no hosted database.
- No high availability. When the PC is off, sync and sign-in are down; recording a Game offline still works and catches up.
- No second machine, no VPS.

## Anti-goals

- A family loses a recorded Game in the move.
- The database, Studio or the service-role key is reachable from the internet.
- A router port is opened or the home IP is published.

## Approaches

How phones reach the PC was the open choice. Two rounds of research (hosted services, then open-source projects on GitHub) found nothing better than the first two below.

1. **Cloudflare Tunnel with an owned domain. Chosen by Cory.** About $10 a year. Stable hostname, valid certificate, router stays closed, home IP hidden.
2. Tailscale Funnel. Free and also keeps the router closed, but the hostname is a `ts.net` name, the feature is labelled beta and its bandwidth limit is unpublished.
3. Port forwarding with dynamic DNS. Free, but opens the router and publishes the home IP. Rejected.

Also rejected: ngrok (free tier capped at 1 GB a month), zrok (warning page for visitors), frp, rathole and Pangolin (each needs a rented VPS), localtunnel and bore (no stable HTTPS hostname).

For the backend there was one sensible way: Supabase's own self-hosting Docker Compose. The app is written against the Supabase client, the schema's row-level security depends on Supabase Auth's `auth.uid()`, and the test double mirrors that. A lighter backend would mean rewriting `server.ts`, the double and the policies.

A hybrid was offered and declined: leaving the front end on Netlify would have kept the current address, so phones would not need a reinstall. Cory asked for everything to move.

## Design

### Pieces

Everything lives in a new `selfhost/` directory in the repo and runs as one Docker Compose project.

| Container | Job | Reachable from |
|---|---|---|
| `db` | Postgres, Supabase's image | the Compose network; `127.0.0.1` for migrations |
| `auth` | Supabase Auth (GoTrue), emailed codes | the Compose network |
| `rest` | PostgREST | the Compose network |
| `kong` | Supabase's API gateway, routes `/auth/v1` and `/rest/v1` | the Compose network |
| `meta`, `studio` | Supabase Studio for hand repairs | `127.0.0.1` only |
| `web` | Caddy: serves `dist`, proxies `/auth/v1/*` and `/rest/v1/*` to `kong` | the Compose network |
| `tunnel` | `cloudflared`, forwards the public hostname to `web` | outbound only |
| `backup` | nightly `pg_dump`, `rclone` copy, failure email | outbound only |

The Compose file starts from the official `supabase/supabase` `docker/docker-compose.yml` with realtime, storage, imgproxy, functions, the pooler and analytics removed. Supabase does not document removing them, so the test run has to prove the app works without them. If a removed service turns out to be required, put it back; 32 GB of RAM allows the full set.

### One hostname

The app and the API share one hostname. Caddy serves the static files and passes `/auth/v1/*` and `/rest/v1/*` to `kong`. `VITE_SUPABASE_URL` is `https://<host>`. One hostname means one tunnel route and no cross-origin requests.

Caddy sets `Content-Type: application/manifest+json` for `/manifest.webmanifest`, as `netlify.toml` does today, and must not cache the service worker file.

`<host>` is a domain Cory registers. It is not chosen yet; the plan's first step is to register it and put it on Cloudflare DNS.

### Secrets

`selfhost/.env` holds the Postgres password, the JWT secret, the anon and service-role keys, the Gmail app password, the tunnel token and the `rclone` config. All are generated fresh for this stack. `.gitignore` already excludes `.env*`; `selfhost/.env.example` lists the names with no values. `VITE_SUPABASE_PUBLISHABLE_KEY` becomes this stack's anon key.

### Schema and data

The migrations have only ever run on hosted Supabase and on PGlite, never on the self-hosted `db` image. Nine of them touch `auth.`, grants or `security definer`. So the plan's first build task is a spike: start `db` and `auth` alone, apply the migrations, and run `docs/schema.test.sql`'s expectations against the result. The rest waits on that.

The order matters:

1. Start the stack, so `auth` creates its own `auth` schema.
2. Apply `supabase/migrations/` with `npx supabase db push --db-url <local url>`, so the migration history table matches the repo. Port 54322 on this PC belongs to another project; this stack must use a different port.
3. Load data only, from hosted production: first the `auth` schema's users and identities, then the `public` schema's rows, with ids unchanged. The hosted dump comes from `npx supabase db dump --remote --data-only` in Cory's own PowerShell window, where the CLI is signed in. If the hosted and self-hosted Auth versions differ in their `auth.users` columns, load by named column.
4. Compare row counts per table between hosted and local before going further.

Sessions do not carry over, because the JWT secret is new. Every phone signs in again, which the new address forces anyway.

### Sign-in email

`auth` gets the same Gmail SMTP sender and app password. The Magic Link and Confirm signup templates keep `{{ .Token }}`, with the same wording as the hosted templates. Self-hosted Auth also caches a template for up to 10 minutes after an edit.

The repo has no `supabase/config.toml`, so the hosted Auth settings live only in the dashboard. One plan task reads them there and copies each into `auth`'s environment: code length and expiry, the per-email and per-hour send limits, whether signup is open, email confirmation, the site URL and redirect allow-list (rewritten for `<host>`), JWT expiry, and refresh token rotation and reuse interval.

### Deploys

`selfhost/deploy.ps1` replaces Netlify's automatic build: fetch `main`, `npm ci`, `npm run build` with the two `VITE_SUPABASE_*` values, replace the served `dist`, then push any new migrations. Cory runs it by hand after promoting to `main`. Promotion to `main` is already a human step.

The `integration` preview deploy is dropped in this version. That is my call, and it changes the fleet's routine: there would be no deployed copy of `integration` to look at before promotion. A second static site on the same PC (same database, as today) is the obvious follow-up if Cory wants it back.

### Backups

- The `backup` container runs `pg_dump` every night and keeps 14 days on `E:\stat-elite-backups`.
- `rclone` copies each dump, encrypted, to Cory's Google Drive. This is the only part of the system that is not on the PC. Cory accepted it when it was proposed; without it one disk failure loses everything.
- The encryption passphrase must also live off the PC, or the Drive copy is useless after a disk failure. Cory saves it in a password manager or on paper when it is generated; the plan has a step for that.
- A failed dump or copy sends an email to Cory through the Gmail sender. That sender is shared with sign-in codes, so a broken sender silences the alert too; a broken sender also stops every sign-in, which Cory would hear about. No alert is sent when the PC is off. Both gaps are accepted for a handful of families.
- Before cutover, one dump is restored into a scratch database and its row counts compared.

### Staying up

- Compose services use `restart: unless-stopped`, and Docker Desktop starts at sign-in.
- The PC's power plan never sleeps or hibernates.
- After a power cut or a Windows Update reboot, the stack stays down until someone signs in to Windows. Whether to turn on automatic sign-in is Cory's choice; this design leaves it off.
- Postgres data stays in a Docker named volume (inside the WSL disk on C:). Bind-mounting Postgres data from a Windows drive is slow and breaks file permissions. The database is a few MB, so C:'s 49 GB is enough.

### Cutover

A phone's local data belongs to the old address. The new address starts empty on every phone: no Remembered Account and none of the rows that phone had not yet synced. The server cannot see unsynced rows, so nothing can check them from the PC. The cutover is therefore a checklist with one line per Account, which Cory ticks off with each family.

0. Before any build work: confirm Cloudflare's free-plan terms allow serving this app and its API through a tunnel. If they do not, stop and return to Cory; Tailscale Funnel is the fallback.
1. Build and test the whole stack on the new hostname with a copy of the data. Hosted production stays live and untouched.
2. Pick a time when no Game is being recorded. For each Account, the family opens the old app online and confirms the badge says their rows are safe. Cory ticks the line.
3. Take the final copy of hosted data and load it, replacing the test copy. Compare counts.
4. Run `deploy.ps1`. Check a real sign-in from a phone on cellular.
5. Stop Netlify's automatic builds, and leave the site as it is. The old installed app must keep working and syncing to hosted Supabase until its family has moved, so the old site is not replaced with a notice: a new deploy there would replace the old app on phones.
6. Cory tells each family the new address. Each one opens it, installs it, signs in, confirms their Games are there and removes the old app. Cory ticks the line.
7. Hosted Supabase stays writable, with no freeze: a read-only hosted database would strand a late row on the phone, where a reinstall destroys it. Until every line is ticked, and for 30 days at most, check hosted weekly for rows written after step 3 and copy any across by hand.
8. When every line is ticked and a last check finds no late rows, Cory pauses the hosted project and takes the Netlify site down. Deleting either is Cory's step and is outside this design.

A Game that exists only on a phone and has never synced cannot be moved by step 3. Step 2 is the guard, and step 7 catches what step 2 misses, as long as the phone still has the old app installed.

### Checks

- `BASE_URL=https://<host> npx playwright test --project=chromium e2e/install.spec.ts e2e/offline.spec.ts` passes.
- A by-hand sign-in with a real inbox on a phone on cellular: code arrives, sign-in works, an Athlete and a Game sync, and a second phone sees them.
- An Invite is created and accepted (`accept_invite`). A throwaway Account is deleted (`delete_my_account`).
- From outside the home network, the Postgres port, Studio and any path other than the app, `/auth/v1` and `/rest/v1` are unreachable through `<host>`.
- The restore test above.
- Reboot the PC, sign in, and the site answers without any other step.

### Docs

`CLAUDE.md`'s Status section, its two `BASE_URL` commands and the line saying every migration must keep the app on `main` working are rewritten for the new setup. `docs/plan.md` is updated wherever it names Netlify or Supabase hosting. A short `selfhost/README.md` covers start, stop, deploy, restore and where the secrets live.

## Left to the builder

- Image versions, pinned to those in the official Compose file on the day of the build.
- The exact dump and load commands, provided ids are unchanged and counts match.
- How Auth is given its email templates.
- The backup image, schedule mechanism and how the failure email is sent.
- Whether `deploy.ps1` swaps `dist` by copy or by a versioned folder.

## Risks Cory should know

- Home internet or power going out takes sync and sign-in down for every family until it returns.
- The PC now holds children's game records and parents' email addresses. Its disk, its Windows account and its Google Drive backup key are what protect them.
- Windows Update can reboot the PC during a game.
