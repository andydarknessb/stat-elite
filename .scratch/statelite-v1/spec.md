# StatElite v1

Status: ready-for-agent

## Problem Statement

A parent at a youth game wants to record what their own child does: shots, rebounds, at-bats, how the team did while the child was on the court. They also want to share it with family afterwards. The existing apps get in the way. Some make the parent set up a roster and keep score for both teams. Some cover a dozen sports and do none of them well. Some lose data when the gym has no signal. Some bury the share step. The parent is standing in the bleachers with one hand free, often with no reception. A mis-tap, a phone call, or an app crash must not cost them a stat, and nothing on the screen should block their view of the play.

## Solution

StatElite is an installable phone web app that records one Athlete's Games. The Recorder (the parent holding the phone) taps large buttons as things happen. Every tap is saved on the phone the instant it is made and works with no signal. When the phone is online, everything uploads by itself. Basketball gets a half-court Shot map, one-tap stat tiles, a Sub In/Sub Out toggle, and Plus/Minus worked out from occasional scoreboard readings, so the Recorder never keeps score. Softball and baseball get a one-tap Plate Appearance flow with RBI chips and standard batting stats. When the Game ends, a share card and ready-to-paste text go out through the phone's share sheet. Practice Focus suggests what to work on at home, drawn from recent Games. No account is needed until the Recorder chooses to save their first Game.

## User Stories

### Getting started

1. As a Recorder, I want to install StatElite to my phone's home screen, so that it opens full-screen like an app with no browser bars.
2. As a Recorder, I want to add my Athlete with a name, jersey number and optional photo on first launch, so that I can start recording right away.
3. As a Recorder, I want to start my first Game without creating an account, so that nothing slows me down at the gym.
4. As a Recorder with more than one child, I want to add another Athlete and switch between them by tapping the photo on Home, so that each child's Games stay separate.
5. As a Recorder, I want the app to ask my phone to keep its storage permanently, so that my recorded Games aren't wiped when the phone runs low on space.

### Game setup

6. As a Recorder, I want Start Game to open a setup screen prefilled from my last Game (sport, Opponent, period format), so that starting a Game is usually one tap.
7. As a Recorder, I want to pick basketball, softball or baseball for a Game, so that the live screen matches the sport.
8. As a Recorder, I want to choose halves or quarters for a basketball Game, so that Period labels match my league.
9. As a Recorder, I want to enter the Opponent's name and the date, so that the Game is easy to find later.

### Recording, every sport

10. As a Recorder, I want every tap saved on my phone the instant I make it, so that a crash, a phone call or switching apps never loses a stat.
11. As a Recorder, I want recording to work with no signal, so that I can use it in steel-framed gyms and on rural fields.
12. As a Recorder, I want a 3-second toast naming what I just recorded, with an Undo button, so that I can fix a mis-tap immediately.
13. As a Recorder, I want a persistent "Undo (last Event)" button that keeps stepping back, so that I can fix a mistake I notice a minute later.
14. As a Recorder, I want an undone Event to stop counting everywhere (tiles, stats, Plus/Minus, share card), so that a correction is complete.
15. As a Recorder, I want a Team–Opponent score strip I can update from the scoreboard whenever I glance at it, so that the app knows the score without me keeping score.
16. As a Recorder, I want my Athlete's own points added to the Team score automatically, so that I only correct the strip when teammates or the Opponent score.
17. As a Recorder, I want End Game to require a Final Score, so that every finished Game has a result to share.
18. As a Recorder, I want a "Next period" button, so that stats can be split by Period and late-game trends show up.
19. As a Recorder, I want to choose a Button Size (Compact, Standard, Bleacher), so that I hit the right button while standing, holding a drink or getting bumped.
20. As a Recorder, I want the app to follow my phone's light or dark setting, so that it is readable in a dim gym and in bright sun.
21. As a Recorder, I want color to carry meaning only (green make, red miss, neutral counting tiles), so that I can read the screen at a glance.
22. As a Recorder, I want no popups during a Game, so that nothing blocks my view of the play.

### Basketball

23. As a Recorder, I want to tap the spot on the half court where my Athlete shot and then tap MAKE or MISS, so that every Shot has a location and a result.
24. As a Recorder, I want a Shot from beyond the arc to count as a 3 automatically, with a toggle to correct it before I tap MAKE or MISS, so that youth courts with odd or missing lines still record correctly.
25. As a Recorder, I want a Free Throw row with MAKE and MISS and the made/attempted count between them, so that each Free Throw takes one tap.
26. As a Recorder, I want large tiles for OREB, DREB, AST, STL, BLK, TO and FOUL that show the live count, so that each takes one tap and I can see the totals.
27. As a Recorder, I want one big Sub In / Sub Out toggle with a running Shift timer, so that tracking when my Athlete is on court takes one tap.
28. As a Recorder, I want the score strip to pulse when I tap Sub In or Sub Out, so that I remember to check it against the scoreboard, which keeps Plus/Minus accurate.
29. As a Recorder, I want my Athlete's Plus/Minus for each Shift and for the whole Game, so that I know how the Team did while my Athlete was on court.
30. As a Recorder, I want Playing Share shown as a percentage with the Shift count, so that I see how much my Athlete played without wall-clock time posing as game minutes.
31. As a Recorder, I want an open Shift to survive the app closing or the phone restarting, so that reopening mid-Game shows my Athlete still on court with the timer right.
32. As a Recorder, I want overtime Periods, so that a Game that goes long is recorded properly.
33. As a Recorder using Standard size, I want the whole basketball live screen to fit my phone without scrolling, so that every button is always one tap away.
34. As a Recorder using Bleacher size, I want the live screen split into two swipe pages (Shots | Other stats), so that the large buttons still fit without scrolling.

### Softball and baseball

35. As a Recorder, I want to record each Plate Appearance's Outcome in one tap from a grid (1B, 2B, 3B, HR · Walk, Hit by pitch, Error, Fielder's choice · Strikeout, Ground out, Fly out, Line out · Sac fly, Sac bunt), so that I keep up with the game.
36. As a Recorder, I want optional Pitch buttons (Ball, Called strike, Swinging strike, Foul) with a live count, so that I can log every Pitch when I want to and skip it when I don't.
37. As a Recorder who logs Pitches, I want strikeouts split into looking and swinging, so that I know which one my Athlete needs to work on.
38. As a Recorder, I want RBI chips (0–4) after each Outcome, so that I record RBIs without tracking teammates on base.
39. As a Recorder, I want a diamond that follows only my Athlete once on base (2nd, 3rd, Scored, Out, Stole), so that runs and stolen bases are recorded without following the whole team.
40. As a Recorder, I want AVG, OBP and SLG computed from my Athlete's Plate Appearances, so that I get standard stats without doing the math.
41. As a Recorder, I want baseball to work exactly like softball, so that one app covers both.
42. As a Recorder, I want innings to advance with Next period, so that the Game knows which inning it is.
43. As a Recorder, I want the same score strip and required Final Score in softball and baseball, so that those Games can be shared with a result too.

### After the Game

44. As a Recorder, I want a Game Complete sheet when I end a Game, so that sharing is the obvious next step.
45. As a Recorder, I want a 1200×1200 share card combining a photo from my phone, the Final Score and my Athlete's line, so that I can send it to family in seconds.
46. As a Recorder, I want to send the share card through my phone's share sheet, so that it goes out by text or any messaging app.
47. As a Recorder, I want ready-to-paste text summarizing the Game, with sport hashtags, copied to my clipboard, so that I can post where images don't fit.
48. As a family member, I want a clear game card by text, so that I can follow the Athlete's Games without installing anything.
49. As a Recorder, I want the photos I use to stay on my phone, so that pictures of my child never go to a server.

### History and insights

50. As a Recorder, I want a Games feed grouped Today / Yesterday / This Week showing Opponent, Final Score, my Athlete's line and Plus/Minus, so that I can find any Game quickly.
51. As a Recorder, I want Home to show my Athlete's season line and recent Games, so that I see progress at a glance.
52. As a Recorder, I want Practice Focus cards on an Insights tab drawn from my Athlete's last 5 Games, so that I know what to practice at home.
53. As a Recorder, I want Practice Focus to say nothing about a court zone with too few attempts, so that I'm not sent chasing noise from one game.

### Account and sync

54. As a Recorder, I want a "Save this game" button at the end of my first Game that signs me in with an emailed link, so that my Games are backed up without a password.
55. As a Recorder, I want everything I recorded before signing in to upload once I sign in, so that nothing from my first Game is lost.
56. As a Recorder, I want my Events to upload by themselves whenever the app is open and online, so that I never have to press a sync button.
57. As a Recorder, I want an "N not synced" badge, so that I know when something still lives only on my phone.
58. As a Recorder, I want an interrupted upload to resume without creating duplicates, so that flaky gym Wi-Fi can't corrupt my stats.
59. As a Recorder who gets a new phone, I want signing in to bring back my Athletes, Games and stats, so that a lost or replaced phone doesn't lose my history (photos excepted).
60. As a Recorder, I want my Athletes and Games visible only to my account, so that other families can't see my child's data.
61. As a Recorder, I want Events to be impossible to change once on the server, so that my history stays exactly as I recorded it.
62. As a Recorder, I want "Delete my account and all data" in Settings, so that I can remove everything about my child from the server and from my phone.

## Implementation Decisions

### Modules

- **App Core**: the headless heart of the app and its main test seam. Its interface is one command per Recorder action (add Athlete, start Game, record Shot, record Free Throw, record a stat tile, Sub In, Sub Out, update score strip, Next period, Undo, End Game, record Pitch, record Plate Appearance with RBI, record baserunning) and one read model per screen (Home, live Game, Games feed, Game Complete, Insights), plus the sync state (signed in or not, count not synced). Behind that interface sit the local Event log, the stat derivation, the upload outbox and restore. It takes an injected clock, local store and server, so tests can run it in Node. (Named App Core rather than "Recorder" because the glossary already uses Recorder for the person.)
- **Screens**: thin React components that call App Core commands and render its read models. They contain no stat logic.
- **Share card renderer**: draws the 1200×1200 card with OffscreenCanvas in a worker from a Game Complete read model plus a photo chosen on the phone, then hands the image to the Web Share API with files. The ready-to-paste text comes from App Core, not the renderer.
- **Practice Focus rules**: a pure part of App Core over the Athlete's last 5 Games. It stays silent on any court zone with fewer than about 10 attempts. The exact zones and rules are designed at the start of M3 from real M2 data; the first candidates are Free Throw drop-off late in Games and weak-side conversion.
- **PWA shell**: a standalone-display manifest, a precached app shell, an Add to Home Screen prompt, and a request for persistent storage.

### Event log and sync (ADR 0001)

- Every tap is written to the phone's store as an Event right away. The phone generates the ID, a per-Game sequence number and a client timestamp. Events are never edited.
- Undo appends a Retraction Event that points at the Event it cancels. Read models ignore retracted Events. Undo steps back through un-retracted Events newest first.
- Each Game has exactly one Recorder, so Events from different phones never mix and there is nothing to reconcile.
- The outbox uploads Athletes, Games and Events the server doesn't have yet, in sequence order. It runs after each write while online, on app launch and on reconnect, because iOS has no Background Sync. Uploads use insert-and-ignore-duplicates, so retries are safe.
- Before sign-in, rows have no owner. "Save this game" signs in by email magic link, stamps the owner on every local row, then lets the outbox run.
- Restore: when an account signs in on a phone, App Core downloads that account's Athletes, Games and Events that the phone doesn't have. Photos are never uploaded, so they don't come back.
- PowerSync and cross-device conflict resolution were rejected (ADR 0001).

### Basketball rules

- Shot entry: tap a spot (coordinates 0–100 on each axis of the half court), and the 3PT toggle lights up, preset from whether the spot is beyond the arc. Then tap MAKE or MISS, which writes one Shot Event. A crash between the two taps loses only that half-entered Shot.
- Free Throws have a result and no spot.
- Sub In and Sub Out are Events that each carry a Score Snapshot. A Shift is a Sub In paired with the next Sub Out. A Sub In with no Sub Out means the Athlete is on court, which is how an open Shift survives a restart.
- Plus/Minus for a Shift = (Team score at Sub Out − Team score at Sub In) − (Opponent score at Sub Out − Opponent score at Sub In) (ADR 0002). The Game's Plus/Minus is the sum over its Shifts.
- Score Snapshots store absolute scores. The Athlete's made Shots and Free Throws add to the strip's Team score; correcting the strip from the scoreboard can't double-count.
- Playing Share = total Shift time ÷ Game elapsed time, all wall-clock, shown with the Shift count.
- Period formats are halves or quarters. Next period moves past the regulation count into overtime with no limit.

### Softball and baseball rules

- Pitches are optional: Ball, Called strike, Swinging strike, Foul. The count shows only when Pitches have been logged in the current Plate Appearance. A strikeout is "looking" or "swinging" according to the last strike Pitch, when there is one.
- Outcomes: single, double, triple, home run · walk, hit by pitch, reached on error, fielder's choice · strikeout, ground out, fly out, line out · sac fly, sac bunt. Each Plate Appearance records an Outcome and an RBI count (0–4).
- At-Bats = Plate Appearances − walks − hit by pitch − sac flies − sac bunts. AVG = hits ÷ At-Bats. OBP = (hits + walks + hit by pitch) ÷ (At-Bats + walks + hit by pitch + sac flies). SLG = total bases ÷ At-Bats.
- Baserunning follows only the Athlete: reached 2nd, reached 3rd, scored, out, each with a "stolen" flag. Where the Athlete starts on base comes from the Outcome.
- Baseball is the same engine with a different sport label.

### Schema (ADR 0003)

- Three tables: Athletes, Games, Events. Every row carries its owner. Row-level security on every table is "owner is the signed-in user", with no joins.
- Composite foreign keys make the database reject a Game whose Athlete has a different owner, an Event whose Game has a different owner, and a Retraction that points at an Event in another Game.
- One Events table for every sport: shared columns (ID, Game, owner, sequence, client time, Period, type, retracted Event) plus nullable sport-specific columns (court x/y, shot value, made, Team and Opponent scores, Pitch, Outcome, RBI, base, stolen). A per-type check requires the right columns for each type. The sequence is unique within a Game.
- Event types: Period start, score, Game end, Retraction; Shot, Free Throw, OREB, DREB, assist, steal, block, turnover, foul, Sub In, Sub Out; Pitch, Plate Appearance, baserunning.
- Games store sport, period format (halves, quarters or innings, consistent with the sport), Opponent name, location and date. Final Score and status come from the Game-end Event, not from columns.
- Events allow select and insert only, never update or delete. A server function deletes the signed-in account, and that cascades to every row.
- The schema and its SQL self-check are checked in and already pass on Postgres 17.

### Screens

- First run (Add Athlete); Home (photo with Athlete switcher, Start Game, season line, recent Games); Game setup (prefilled from the last Game); live Game per sport; Games feed; Game Complete; Insights; Settings (Button Size, sign-in, Delete account). Tabs: Home · Games · Insights · Settings.
- Undo shows as a 3-second toast plus a persistent labeled button. There are no modals on the live screen.
- Theme tokens for light and dark follow the phone's setting. The palette is StatElite's own.

### Stack and platform

- React, TypeScript and Vite; vite-plugin-pwa 2 (Workbox 7); Dexie 4 for the phone's store; supabase-js for auth and upload.
- Minimum platform: iOS 16.4 (the first version with OffscreenCanvas) and current Chrome on Android.

### Milestones

1. **M1, shell, local store, sync**: PWA shell, App Core Event log with Undo, Button Size and theme tokens, schema and row-level security, outbox and restore, "Save this game", Delete account, First run and Athlete switcher.
2. **M2, basketball**: Game setup, live screen (first ticket: confirm it fits at Standard and splits at Bleacher), Shot entry, Free Throws, stat tiles, Periods and overtime, Sub In/Out, score strip, Plus/Minus, Playing Share, Home, Games feed.
3. **M3, share card and Practice Focus**: Game Complete sheet, share card, Web Share, copy text, Insights tab and Practice Focus rules.
4. **M4, softball and baseball**: Plate Appearance flow, optional Pitches, Outcome grid, RBI chips, Athlete-only diamond, score strip with Final Score, AVG/OBP/SLG, baseball label.

## Testing Decisions

- A good test drives App Core through its public commands and checks its read models, the way a screen would. It never reads the local store's tables or calls derivation helpers directly, so internals can change without breaking tests.
- **App Core tests (main seam)** run in Node with a fake IndexedDB, an injected clock and an in-memory server stand-in that behaves like insert-and-ignore-duplicates and owner-only reads. They cover:
  - Undo and Retractions reaching every read model.
  - Plus/Minus, including strip corrections and the Athlete's own points.
  - Playing Share, Periods and overtime.
  - An open Shift surviving a restart: build a new App Core on the same store and check the Athlete is still on court.
  - Outbox ordering, retry after failure, no duplicates, and the owner stamp at sign-in.
  - Restore onto an empty phone.
  - At-Bats, AVG, OBP and SLG.
  - Practice Focus thresholds.
  - Share-card text.
- **Database tests**: the existing SQL self-check (constraints, owner-only access, Events that can't be edited, account deletion) runs on throwaway Postgres. It already passes; extend it whenever the schema changes.
- **Phone-sized smoke tests**: a few Playwright runs at 390×844:
  - A full basketball Game recorded with the network offline, which then uploads when back online.
  - The live screen with no vertical scroll at Standard, and two pages at Bleacher.
  - A 1200×1200 share-card image produced.
- The test runner is Vitest, matching the Vite stack.
- Prior art: the only existing test is the schema self-check. App Core tests set the pattern for everything else.

## Out of Scope

- Streak indicators.
- Video highlights and the training log.
- Shared Athletes between accounts, and live viewing of a Game from another phone.
- Background sync while the app is closed (iOS doesn't support it).
- Uploading or syncing photos.
- Cross-device conflict resolution.
- AI-generated insights.
- Sports other than basketball, softball and baseball.
- Payments.
- Roster setup and scorekeeping for the whole Team or the Opponent.

## Further Notes

- This spec replaces the original StatElite engineering specification. Decisions and their reasons are in ADRs 0001–0003. Vocabulary is in the glossary, and every term in this spec uses it.
- The iOS 16.4 minimum was set during planning to get OffscreenCanvas and was not discussed further. Lower it only if older iPhones turn out to matter.
- The real supabase-js upload path is covered only by the server stand-in and the SQL self-check. A full local Supabase in the test suite would need Docker running.
- Research (2026-10-30): Web Share with files works from iOS 14; OffscreenCanvas from iOS 16.4; a 1200×1200 canvas is under a tenth of Safari's canvas limit; WebKit says home-screen apps count their own days of use for the 7-day storage rule (confidence low for 2026). The fast outbox is the real protection against data loss.
- Whether the basketball live screen fits a phone at Standard size is unverified until the first M2 ticket.
