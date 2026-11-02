# A removed Game stays as a hidden row

A Recorder removes a Backlogged Game entered by mistake, such as a duplicate or one under the wrong Athlete. Removal is a Game edit: `removeBacklog` sets `games.removed` and moves `updated_at`, through the same outbox as `editBacklog`. Every phone hides a removed Game from the Games feed, the season line, the summary, Game setup's prefill and the Athlete deletion count. The row stays on the server. There is no restore; the Recorder who wants the Game back enters it again.

A live Game can never be removed: a check on `games` refuses `removed` on a Game with no Totals (ADR 0005). Only the Game's Recorder removes it, under the same policy that lets it edit the Game.

## Considered Options

- **Hard delete through an RPC:** the outbox names a row and drops the entry once the row is gone, so a removal would need a new entry kind. `download` would have to prune by absence and tell "removed" from "not uploaded yet", and another phone's queued edit would re-insert the Game through the upsert. Members would need a new delete policy.
- **A removal timestamp instead of a boolean:** the same sync as the boolean, but a new column that would also have to join the phone's timestamp list. `updated_at` already says when.

## Consequences

- The Game's row, its Opponent and its Totals stay readable on the server to the Athlete's Members through the API, until the Athlete or the account is deleted. The app promises only that the phones hide it.
- A Recorder's second phone that still holds an older copy can bring the Game back with a later edit, since latest edit wins (ADR 0001).
- A Backlogged Game whose Recorder deleted their account has `recorded_by` null, so nobody can remove it.
- An Owner cannot remove a Game a Member recorded, because only the Recorder updates a Game.
