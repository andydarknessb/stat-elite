# A Backlogged Game keeps its Totals on the Game, with no Events

A Game entered after it was played stores what the Recorder entered, its Totals and Final Score, in `games.totals`, and has no Events. App Core turns the Totals into the same counts and stats it derives from Events, so the season line, Games feed and summary treat it as any finished Game. Totals are Game details, so they can be edited, and edits sync as latest edit wins (ADR 0001).

## Considered Options

- **One Event per counted thing:** keeps a single read path, but a Shot needs a spot the Recorder doesn't have, every Free Throw would land in one Period and skew Practice Focus, and the outbox uploads one row per call, so a season's backlog would queue over a thousand calls. A correction would also have to retract and replace the Final Score.
- **A separate totals table:** adds a table, its policies and a download path to hold one row per Game.
- **Re-tapping through the live screen with a past date:** already possible, but it needs a made-up spot for every Shot, and those spots skew Practice Focus Zones.

## Consequences

- A Game has Events or Totals, never both. Only a Game without Totals can be in progress.
- Plus/Minus and Playing Share have no Shifts to read, so a Backlogged Game shows "—" for both, and Practice Focus leaves it out.
- Totals are shaped by sport, so a Backlogged Game's sport is fixed once saved.
- A Member who records a Game can now update that Game's row while still a Member (`recorder_updates_games`). Before this, the update matched no row and reported no error.
- The migration must reach the database before the app that uses it: the outbox stops at the first row the server refuses.
