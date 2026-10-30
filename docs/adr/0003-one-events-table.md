# One events table for every sport

All Events, basketball and softball/baseball alike, live in a single `events` table: shared columns (id, game, owner, sequence, time, Period, type, the Event it retracts) plus typed nullable columns for sport-specific fields (court x/y, shot value, made, scores, Pitch, Outcome, RBI), with a per-type CHECK that requires the right fields. Period starts, Score Snapshots, and Retractions belong to every sport, and one table gives the outbox (ADR 0001) a single ordered stream to upload.

## Considered Options

- **One table per sport** (original spec): every shared Event type is duplicated, and the outbox has to upload several streams in order.
- **Shared columns plus a `jsonb` payload**: flexible, but the database can no longer reject a malformed Shot.

## Consequences

- Adding a sport means new nullable columns and CHECK branches, not a new table.
- The database does not check that an Event's type matches its Game's sport; the app does.
