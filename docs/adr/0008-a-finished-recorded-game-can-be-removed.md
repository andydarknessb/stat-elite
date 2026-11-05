# A finished recorded Game can be removed

A Recorder can now remove any finished Game, including one recorded with Events: a Game recorded under the wrong Athlete, or a Start Game tapped by mistake and closed with End Game. Removal works as ADR 0006 describes: `removeGame` (formerly `removeBacklog`) sets `games.removed` and moves `updated_at`, and every phone hides the Game. Its row and Events stay on the server. This replaces ADR 0006's rule that a live Game can never be removed.

A Game in progress cannot be removed. App Core refuses it and the live screen has no Remove button, so a mis-tap during play can't lose a Game. Only the Game's Recorder is offered Remove, from the Game's summary.

## Considered Options

- **Removing a Game in progress too:** puts a Remove button beside the buttons a Recorder taps during play. End Game already closes a mistaken start.
- **Erasing the row and Events:** ADR 0006's reasons against a hard delete still apply.
- **A server trigger that refuses removal before End Game:** a Game finished and removed offline uploads its row before its Events, so the trigger would refuse the row, and the outbox stops at the first row the server refuses.
- **A Removed Games list with Restore:** a new screen for a rare mistake the confirm step already guards against.
- **Letting the Owner remove a Game a Member recorded:** hides another Recorder's work without asking them.

## Consequences

- The check ADR 0006 added is gone and nothing replaces it, so an API call by the Game's Recorder or the Athlete's Owner can set `removed` on a Game still in progress.
- The app cannot bring a removed Game back, and a recorded Game's Events can't be entered again. Setting `removed` to false with a new `updated_at` on the server brings it back on every phone at its next download.
- ADR 0006's second-phone risk stays with Backlogged Games: a recorded Game's row has no edit, so no other phone can bring it back.
- A Member loses a removed Game with no notice. The confirm step says it leaves every phone.
- A Game whose Recorder deleted their account has `recorded_by` null, so nobody can remove it.
