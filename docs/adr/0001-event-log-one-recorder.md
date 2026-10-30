# Events are an append-only log, one Recorder per Game

Every tap is saved on the phone as an Event the moment it happens and is never edited afterwards; Undo marks an Event retracted instead of destroying it, and the retraction syncs like any other change. Each Game has exactly one Recorder, so Events from two phones never mix and sync reduces to "upload what the server doesn't have yet", keyed by IDs the phone generates. Uploads run only while the app is open (after each tap when online, on launch, on reconnect) because iOS Safari has no Background Sync.

## Considered Options

- **Hold each tap for 3 seconds before saving** (original spec): a crash or app switch in that window loses the tap.
- **Conflict resolution across devices** (original M4): unnecessary once a Game has one writer.
- **PowerSync**: a local SQLite replica synced to Postgres; adds a vendor to solve conflicts this design doesn't have.

## Consequences

- Only the Recorder's phone writes a Game's Events. v1 has no live viewing; Members of the Athlete (ADR 0004) see a Game once it uploads, and anyone else through its share card.
- Before the Recorder signs up, Events live only on the phone; the first "Save this game" uploads them.
- Athletes and Games are not Events: their details (name, number, Opponent, location) can be edited, and edits sync as latest edit wins by an updated-at time set on the phone. Only Events are append-only.
