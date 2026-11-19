# Production on Cory's PC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** StatElite's production (web app, database, sign-in, backups) runs on Cory's Windows desktop behind a Cloudflare Tunnel, with every hosted row carried over.

**Architecture:** One Docker Compose project in `selfhost/`, cut down from Supabase's official self-hosting Compose file to Postgres, Auth, PostgREST and the Kong gateway, plus Caddy for the static app, `cloudflared` for the tunnel and a backup container. One public hostname: Caddy serves `dist` and proxies `/auth/v1/*` and `/rest/v1/*` to Kong. No file under `src/` changes.

**Tech Stack:** Docker Compose, `supabase/postgres`, `supabase/gotrue`, PostgREST, Kong, Caddy 2, `cloudflared`, `rclone`, PowerShell 5.1, Supabase CLI through `npx supabase`.

**Spec:** `docs/superpowers/specs/2026-11-19-local-production-design.md`

## Global Constraints

- No change under `src/`, `supabase/migrations/` or `docs/adr/`.
- `<host>` is the domain Cory registers in Task 0. Every file reads it from `selfhost/.env` as `HOST`; nothing hardcodes it.
- Compose project name `statelite`. Postgres is published on `127.0.0.1:54422` and Studio on `127.0.0.1:54423`, both bound to loopback. Port 54322 belongs to another project on this PC and must never be used.
- The tunnel forwards only to `web:80`. No other container is published beyond loopback.
- Secrets live only in `selfhost/.env` (ignored by `.env*` in `.gitignore`). `selfhost/.env.example` carries the names with empty values.
- Image tags are pinned to the tags in `supabase/supabase` `docker/docker-compose.yml` on the day Task 1 runs. No `latest`.
- Every service has `restart: unless-stopped`.
- Hosted Supabase (ref `gextmglkwnchywwtccbf`) and the Netlify site are read, never written, until Task 8. Any Supabase CLI command against hosted needs `--remote` and runs in Cory's own PowerShell window.
- PowerShell scripts target Windows PowerShell 5.1: no `&&`, no ternary, `-Encoding utf8` on file writes.
- Use the terms in `GLOSSARY.md`.
- Work lands on `fleet/selfhost-*` branches by pull request into `integration`. Cory merges and deploys.
- Only one task at a time may start or stop the Compose stack. Tasks 4, 5 and 6 edit separate files and can be written in parallel; their stack checks run one after another.

## Review Focus

1. The PC reboots or the stack stops while a phone is recording a Game: the phone keeps recording, and the rows sync when the stack returns. Pinned in Task 3.
2. A phone's session outlives a long stack outage: the refresh token still works afterwards and the family is not signed out. Pinned in Task 3.
3. A new build is deployed while the app is installed: the phone picks it up, because `sw.js` and `index.html` are never served from a cache. Pinned in Task 4.
4. `E:\stat-elite-backups` is missing or the Drive copy fails: the backup exits non-zero and the failure email is sent; it never reports a night as done with no dump. Pinned in Task 6.
5. A request through the tunnel for anything but the app, `/auth/v1` and `/rest/v1` (for example `/pg/`, `/storage/v1/`, `/project/default`): Caddy answers 404 and Kong never sees it. Pinned in Task 4.

---

## Files

| Path | Responsibility |
|---|---|
| `selfhost/docker-compose.yml` | every container, its ports and volumes |
| `selfhost/.env.example` | the name of every secret and setting |
| `selfhost/volumes/db/*.sql` | the official image's init scripts (roles, JWT, webhooks), copied unchanged |
| `selfhost/volumes/api/kong.yml` | Kong routes: `/auth/v1` and `/rest/v1` only |
| `selfhost/Caddyfile` | static app, the two proxied prefixes, headers, the template listener |
| `selfhost/templates/magic_link.html`, `confirmation.html` | sign-in emails, both carrying `{{ .Token }}` |
| `selfhost/smoke.ps1` | the checks a running stack must pass |
| `selfhost/deploy.ps1` | build `main`, replace the served app, push migrations |
| `selfhost/backup/backup.sh`, `Dockerfile` | nightly dump, Drive copy, failure email |
| `selfhost/README.md` | start, stop, deploy, restore, where the secrets are |
| `docs/superpowers/cutover-checklist.md` | one line per Account for the cutover |

---

### Task 0: Preconditions (Cory and the architect, no code)

- [ ] **Step 1:** A researcher reads Cloudflare's current Self-Serve Subscription Agreement and service-specific terms and reports, with the URL and the quoted clause, whether a free-plan tunnel may serve a web app and its JSON API. If it may not: stop and return to Cory.
- [ ] **Step 2 (Cory):** Register the domain through Cloudflare Registrar, or move an owned domain's DNS to Cloudflare. Report the hostname.
- [ ] **Step 3 (Cory):** In Cloudflare Zero Trust, create a tunnel named `statelite`, add the public hostname `<host>` with service `http://web:80`, and put the tunnel token in `selfhost/.env` as `TUNNEL_TOKEN`.
- [ ] **Step 4 (Cory):** From the hosted dashboard's Auth pages, read out: email code length, code expiry, the email send rate limit, the per-address resend interval, signup on or off, confirm-email on or off, site URL, redirect allow-list, JWT expiry, refresh token rotation and reuse interval, and the subject and body of the Magic Link and Confirm signup templates.

Task 1 does not wait on Steps 2 to 4.

### Task 1: Spike, the migrations on the self-hosted database image

**Files:**
- Create: `selfhost/docker-compose.yml` (services `db` and `auth` only), `selfhost/.env.example`, `selfhost/volumes/db/*.sql`, `selfhost/smoke.ps1`

**Interfaces:**
- Produces: `selfhost/smoke.ps1 -Stage <db|api|web|public> [-BaseUrl <url>]`, exit code 0 when every check of that stage and the stages before it passes. `.env` names: `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `HOST`. Local database URL: `postgresql://postgres:<POSTGRES_PASSWORD>@127.0.0.1:54422/postgres`.

- [ ] **Step 1:** Write `smoke.ps1 -Stage db` with these checks, each printing its name and PASS or FAIL: the database answers on `127.0.0.1:54422`; nothing listens on `0.0.0.0:54422`; roles `anon`, `authenticated` and `service_role` exist; `auth.users` exists; `select count(*) from supabase_migrations.schema_migrations` returns 13; the body of `docs/schema.test.sql` after its marker line runs to the end inside a transaction that is rolled back.
- [ ] **Step 2:** Run it with no stack. Expected: FAIL on the first check.
- [ ] **Step 3:** Copy `db` and `auth` from the official Compose file with their init scripts. Generate the secrets into `selfhost/.env`. Start both and wait for `auth` to be healthy.
- [ ] **Step 4:** Run `npx supabase db push --db-url <local url>`. Expected: 13 migrations applied.
- [ ] **Step 5:** Run `smoke.ps1 -Stage db`. Expected: every check PASS.
- [ ] **Step 6:** If a migration fails on this image, stop and report the migration, the statement and the error to the architect. Do not edit a migration.
- [ ] **Step 7:** Commit.

### Task 2: The API, Studio, and sign-in email

**Files:**
- Modify: `selfhost/docker-compose.yml` (add `rest`, `kong`, `meta`, `studio`), `selfhost/.env.example`, `selfhost/smoke.ps1`
- Create: `selfhost/volumes/api/kong.yml`, `selfhost/templates/magic_link.html`, `selfhost/templates/confirmation.html`

**Interfaces:**
- Consumes: Task 0 Step 4's settings; Task 1's `.env` names.
- Produces: Kong at `http://kong:8000` on the Compose network. `.env` names `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL`, `SMTP_SENDER_NAME`. Auth fetches its templates from `http://web:8080/magic_link.html` and `http://web:8080/confirmation.html`, which Task 4 serves.

- [ ] **Step 1:** Add `-Stage api` checks, run from a throwaway container on the Compose network: `GET kong:8000/auth/v1/settings` with the anon key returns 200 and reports email sign-in enabled; `GET kong:8000/rest/v1/athletes` with the anon key returns 200 and `[]`; `GET kong:8000/pg/tables` and `GET kong:8000/storage/v1/bucket` return 404; `http://127.0.0.1:54423` returns Studio; Studio does not answer on the PC's LAN address.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Add the four services. Cut `kong.yml` down to the `/auth/v1` and `/rest/v1` routes. Remove every reference to realtime, storage, imgproxy, functions, the pooler and analytics. Set each Auth variable from Task 0 Step 4, with the site URL `https://<HOST>`. Write both templates with the hosted wording and `{{ .Token }}`.
- [ ] **Step 4:** Run `smoke.ps1 -Stage api`. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 3: The data copy, and proof the app works on it

**Files:**
- Create: `selfhost/load-data.ps1`
- Modify: `selfhost/smoke.ps1`

**Interfaces:**
- Consumes: `selfhost/dumps/auth.sql` and `selfhost/dumps/public.sql` (ignored by git), which Cory makes with `npx supabase db dump --remote --data-only --schema auth -f selfhost/dumps/auth.sql` and the same for `public`.
- Produces: `selfhost/load-data.ps1 [-Replace]`: loads `auth.users` and `auth.identities`, then every `public` table, in one transaction; `-Replace` truncates them first. It prints one line per table, `<table> hosted=<n> local=<n>`, and exits non-zero when any pair differs. Hosted counts come from `selfhost/dumps/counts.txt`, which Cory makes from one SQL query the script prints with `-PrintCountQuery`.

- [ ] **Step 1:** Write `load-data.ps1` and run it with no dumps. Expected: non-zero exit naming the missing file.
- [ ] **Step 2 (Cory):** Make the two dumps and `counts.txt`.
- [ ] **Step 3:** Run `load-data.ps1`. Expected: every line shows equal counts. If `auth.users` columns differ between hosted and this image, load by named column and report the columns dropped.
- [ ] **Step 4:** Build the app with `VITE_SUPABASE_URL=http://localhost:54424` and this stack's anon key, publish Kong on `127.0.0.1:54424` for this step only, and run `npx playwright test --project=chromium` with `BASE_URL` at `vite preview`. Expected: the specs that pass on `integration` pass here. Remove the Kong port afterwards.
- [ ] **Step 5 (Review Focus 1):** With the preview open and signed in, stop the stack, record three Events, start the stack. Expected: the three rows are in `events` within a minute and the badge says the rows are safe.
- [ ] **Step 6 (Review Focus 2):** Set the JWT expiry to 60 seconds, sign in, stop the stack for three minutes, start it. Expected: the next sync succeeds with no sign-in screen. Restore the expiry from Task 0 Step 4.
- [ ] **Step 7:** Commit `load-data.ps1`.

### Task 4: The web server and the tunnel

**Files:**
- Create: `selfhost/Caddyfile`
- Modify: `selfhost/docker-compose.yml` (add `web`, `tunnel`), `selfhost/smoke.ps1`

**Interfaces:**
- Consumes: Kong at `http://kong:8000`; `TUNNEL_TOKEN`; the served app at `selfhost/site/` (Task 5 fills it).
- Produces: `web` listening on `:80` for the public site and on `:8080`, Compose network only, serving `selfhost/templates/`.

- [ ] **Step 1:** Add `-Stage web` checks against `web:80` on the Compose network: `/` returns 200 HTML; `/manifest.webmanifest` has `Content-Type: application/manifest+json`; `/sw.js` and `/index.html` have `Cache-Control: no-cache`; a hashed file under `/assets/` has a one-year immutable cache header; `/auth/v1/settings` with the anon key returns 200; `/pg/tables`, `/storage/v1/bucket`, `/project/default`, `/rest/` without `v1` and `/magic_link.html` return 404 on port 80 (Review Focus 5); `web:8080/magic_link.html` returns the template.
- [ ] **Step 2:** Add `-Stage public -BaseUrl https://<host>`: the same checks through the tunnel; the certificate is valid; ports 54422 and 54423 do not answer on `<host>`.
- [ ] **Step 3:** Run `-Stage web`. Expected: FAIL.
- [ ] **Step 4:** Write the `Caddyfile` and add the two services. `web` serves over plain HTTP; Cloudflare terminates TLS. Check whether the app needs an `index.html` fallback for unknown paths by reading how an Invite link is opened; add it only if it does, and only outside the prefixes above.
- [ ] **Step 5:** Run `-Stage web`, then `-Stage public`. Expected: PASS.
- [ ] **Step 6 (Review Focus 3):** Deploy a build, load it in a browser, deploy a second build with a visible change, reload once. Expected: the second build shows without clearing site data.
- [ ] **Step 7:** Commit.

### Task 5: Deploys

**Files:**
- Create: `selfhost/deploy.ps1`

**Interfaces:**
- Produces: `selfhost/deploy.ps1 [-Ref main]`. It fetches the ref into a separate git worktree under `selfhost/.build`, runs `npm ci` and `npm run build` with `VITE_SUPABASE_URL=https://<HOST>` and `VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY>`, builds into a new folder, swaps `selfhost/site` to it only after the build succeeds, runs `npx supabase db push --db-url <local url>`, then runs `smoke.ps1 -Stage public`.

- [ ] **Step 1:** Run `deploy.ps1 -Ref <a ref whose build fails>`. Expected: non-zero exit and `selfhost/site` unchanged.
- [ ] **Step 2:** Write the script.
- [ ] **Step 3:** Run it on `main`. Expected: exit 0, and `BASE_URL=https://<host> npx playwright test --project=chromium e2e/install.spec.ts e2e/offline.spec.ts` passes.
- [ ] **Step 4:** Commit.

### Task 6: Backups

**Files:**
- Create: `selfhost/backup/backup.sh`, `selfhost/backup/Dockerfile`
- Modify: `selfhost/docker-compose.yml` (add `backup`), `selfhost/.env.example`

**Interfaces:**
- Produces: a `backup` service that runs `backup.sh` at 03:00 local time. `backup.sh` writes `statelite-<YYYY-MM-DD>.dump` (`pg_dump -Fc`) to `/backups`, mounted from `E:\stat-elite-backups`; deletes dumps older than 14 days; copies the new dump to the `rclone` crypt remote `drive-crypt:statelite`; on any failed step sends an email to `ALERT_EMAIL` through the SMTP settings and exits non-zero. `.env` names: `ALERT_EMAIL`, `RCLONE_CONFIG_PATH`. `backup.sh restore <file> <database>` restores a dump into a named scratch database.

- [ ] **Step 1 (Review Focus 4):** Run `backup.sh` with `/backups` unmounted, then with a wrong `rclone` remote. Expected: non-zero exit each time and one email each time; with the wrong remote the local dump still exists.
- [ ] **Step 2:** Write the script and image.
- [ ] **Step 3 (Cory):** Run `rclone config` once to authorise Google Drive and create the crypt remote. Save the crypt passphrase in a password manager or on paper, off the PC.
- [ ] **Step 4:** Run `backup.sh` by hand. Expected: a dump on E:, the same file listed by `rclone ls drive-crypt:statelite`, exit 0, no email.
- [ ] **Step 5:** Run `backup.sh restore <that file> restore_test`, then compare row counts per table with the live database. Expected: equal. Drop `restore_test`.
- [ ] **Step 6:** Commit.

### Task 7: Staying up, and the README

**Files:**
- Create: `selfhost/README.md`

- [ ] **Step 1 (Cory, with the commands from the README):** Set Docker Desktop to start at sign-in. Set the power plan so the PC never sleeps or hibernates: `powercfg /change standby-timeout-ac 0` and `powercfg /change hibernate-timeout-ac 0`.
- [ ] **Step 2:** Write the README: start, stop, deploy, restore, where the secrets and the passphrase live, the two ports, the warning about 54322, and that the stack is down after a reboot until Windows is signed in.
- [ ] **Step 3:** Reboot the PC and sign in. Expected: `smoke.ps1 -Stage public` passes with no other step.
- [ ] **Step 4:** Commit.

### Task 8: Cutover (Cory leads; the architect checks each step)

**Files:**
- Create: `docs/superpowers/cutover-checklist.md`
- Modify: `CLAUDE.md` (Status, the two `BASE_URL` commands, the line on migrations keeping `main` working), `docs/plan.md` (each mention of Netlify or Supabase hosting)

- [ ] **Step 1:** Write the checklist with one line per Account, from `select email from auth.users` on the local copy, with two boxes per line: "old app's badge says rows are safe" and "signed in at the new address, Games present, old app removed".
- [ ] **Step 2 (Cory):** At a time with no Game being recorded, tick the first box for every Account.
- [ ] **Step 3 (Cory, then the implementer):** Make fresh dumps and `counts.txt`; run `load-data.ps1 -Replace`. Expected: every count equal.
- [ ] **Step 4:** Run `deploy.ps1`. Then the by-hand checks: a sign-in with a real inbox from a phone on cellular; an Athlete and a Game sync and a second phone sees them; an Invite is created and accepted; a throwaway Account is deleted.
- [ ] **Step 5 (Cory):** Stop Netlify's automatic builds and leave the site as it is.
- [ ] **Step 6 (Cory):** Give each family the new address and tick the second box as each one moves.
- [ ] **Step 7:** Weekly until every line is ticked, 30 days at most: Cory makes a fresh `public` dump, and the implementer reports rows on hosted that are newer than Step 3's dump. Cory approves each copy across.
- [ ] **Step 8:** Update `CLAUDE.md` and `docs/plan.md`, mark the spec's status as done, and commit.
- [ ] **Step 9 (Cory):** With every line ticked and a last check clean, pause the hosted project and take the Netlify site down.
