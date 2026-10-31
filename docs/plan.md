# StatElite v1 plan

Revises `statelite_engineering_specification.md` after the 2026-10-30 design review. Terms are defined in `GLOSSARY.md`, decisions in `docs/adr/`, tables in `docs/schema.sql`.

## Product

- A public product for families. v1 goes to a handful of families, with no payments.
- Each Athlete has one Owner and can be shared with Members through an Invite (M3, ADR 0004). No live viewing in v1: Members see a Game once it uploads, everyone else through its share card.
- No account until the first Game ends: "Save this game" asks for an email magic link or the emailed code, then uploads everything recorded so far.
- Photos stay on the phone. Only stats sync.
- Settings has "Delete my account and all data" (`delete_my_account()`), which also clears the phone. From M3, shared Athletes pass to a Member instead of being deleted.

## Screens

| Screen | Design | Pattern from |
|---|---|---|
| First run | "Add Athlete" form: name, number, optional photo | — |
| Home | Athlete photo, Start Game, season line, recent Games. Tapping the photo switches Athlete when the account has more than one | MyKidDid dashboard |
| Game setup | Sport, Opponent, date, period format, all prefilled from the last Game so starting is one tap | — |
| Live game, basketball | Shift timer and Sub In/Out toggle on top, Team–Opponent strip, half court for Shots, Free Throw row, 2-column stat tiles with live counts | Stattie (shift bar), Buckets (tiles, Free Throw row) |
| Live game, softball/baseball | Team–Opponent strip, optional Pitch buttons, Outcome grid, RBI chips, diamond for the Athlete only | spec's Plate Appearance flow |
| Games | Feed grouped Today / Yesterday / This Week; each row shows Opponent, Final Score, the Athlete's line, Plus/Minus on basketball rows | Stattie Activity |
| Game Complete | Share card and ready-to-paste text | MyKidDid |
| Insights | Practice Focus cards; layout designed at the start of M4 alongside the rules | — |
| Athlete sharing | Invite co-parent (link through the share sheet), Members list, Remove Member (Owner only), Leave (Members) | — |

Navigation: bottom tabs Home · Games · Insights · Settings.

Interaction rules:

- **Shot entry:** tap the spot, then MAKE or MISS (no default). A spot beyond the arc counts as a 3, with a toggle to correct it before MAKE/MISS. Free Throws use `MAKE | made/att | MISS` with no spot.
- **Basketball tiles:** OREB, DREB, AST, STL, BLK, TO, FOUL.
- **Undo:** a 3-second toast ("Missed 3PT · Undo") plus a persistent "Undo (last Event)" button that keeps stepping back. Each Undo adds a Retraction.
- **Score strip:** the Recorder updates it from the scoreboard. The Athlete's own points add to it automatically. Sub In, Sub Out and End Game record a Score Snapshot, and End Game requires one in every sport.
- **Pitches (optional):** Ball · Called strike · Swinging strike · Foul. The count shows only when they're used.
- **Softball/baseball Outcomes:** 1B, 2B, 3B, HR · Walk, Hit by pitch, Error, Fielder's choice · Strikeout, Ground out, Fly out, Line out · Sac fly, Sac bunt. Then the RBI chips 0–4. Once the Athlete is on base, tap 2nd, 3rd, Scored, Out, or Stole.
- **Button Size:** Compact, Standard, Bleacher. Bleacher splits the basketball live screen into two swipe pages (Shots | Other stats).
- **Theme:** follows the phone's light/dark setting. Color only carries meaning: green for make, red for miss, neutral for counting tiles. StatElite uses its own palette.

## Stats

- **Plus/Minus** per Shift = change in Team score − change in Opponent score between the Sub In and Sub Out snapshots (ADR 0002).
- **Playing Share** = total Shift time ÷ Game elapsed time, shown with the Shift count. All times are wall-clock; there is no game clock.
- **AVG** = H / AB; **OBP** = (H + BB + HBP) / (AB + BB + HBP + SF); **SLG** = total bases / AB, where AB = Plate Appearances − BB − HBP − SF − SAC.

## Milestones

**M1: shell, local store, sync**
- vite-plugin-pwa manifest (`display: standalone`), Workbox precache, Add to Home Screen prompt, `navigator.storage.persist()`.
- Dexie Event log: phone-generated UUIDs, `seq` per Game, client timestamps.
- Undo through Retraction Events.
- Button Size setting and theme tokens.
- Supabase schema and row-level security (`docs/schema.sql`).
- Outbox uploads after each tap when online, on launch, and on reconnect, plus an "N not synced" badge (ADR 0001).
- Download at sign-in brings back the account's Athletes, Games and Events on a new phone.
- Athlete and Game edits sync as latest edit wins; Events stay insert-only (ADR 0001).
- "Save this game" magic link or emailed code, and Delete account.
- First run (Add Athlete) and the Athlete switcher on Home.

**M2: basketball**
- Game setup, prefilled from the last Game.
- Live screen, Shot entry, Free Throws, stat tiles.
- Periods: halves or quarters, plus overtime; softball and baseball count innings, labelled "Inn N". All advance by "Next period".
- Sub In/Out, score strip, Plus/Minus, Playing Share. An open Shift survives an app restart: a Sub In with no Sub Out means the Athlete is on court.
- Bleacher two-page layout, Home, Games feed.

**M3: sharing an Athlete (ADR 0004)**
- Invite, Members, Remove Member and Leave, as ADR 0004 describes. Accepting an Invite signs the invitee in and makes them a Member.
- Download also runs on launch and reconnect, bringing in Games recorded on other phones.
- Delete account: each shared Athlete passes to the Member who joined first, and the delete screen says so. A Member's own deletion leaves the Games they recorded with the Athlete.

**M4: share card and Practice Focus**
- Game Complete sheet: a 1200×1200 card drawn with OffscreenCanvas in a worker, shared with Web Share files, plus copy text.
- Insights tab with Practice Focus cards. Rules run on the phone over the last 5 Games, staying silent on any zone with fewer than about 10 attempts. Exact zones and rules get designed at the start of M4 from M2 data. First candidates: Free Throw drop-off late in games, weak-side conversion.

**M5: softball and baseball**
- Plate Appearance flow, optional Pitches, Outcome grid, RBI chips, Athlete-only diamond, score strip with a required Final Score.
- AVG, OBP and SLG.
- Baseball is a label on the same engine.

## Cut from v1

Streak evaluator · video highlights and training log · live viewing · background sync (iOS doesn't support it) · photo sync · cross-device conflict resolution · AI-generated insights.

## Stack

React + TypeScript + Vite, vite-plugin-pwa 2 (Workbox 7), Dexie 4, supabase-js. The outbox is our own code; PowerSync was rejected in ADR 0001.

Hosting: Netlify serves https://stat-elite.netlify.app, rebuilt from `integration` on every push (`netlify.toml`). The Supabase env vars live in Netlify, not the repo.

Minimum platform: iOS 16.4, the first version with OffscreenCanvas, and current Chrome on Android.
