# Plus/Minus comes from Score Snapshots, not a running score

Plus/Minus needs both teams' scores at every Sub In and Sub Out, but the Recorder is not a scorekeeper. The live screen keeps a Team–Opponent strip that the Recorder updates from the gym scoreboard; tapping Sub In or Sub Out records a Score Snapshot, and the Athlete's own made Shots and Free Throws add to the Team score automatically. Plus/Minus for a Shift is the change in Team score minus the change in Opponent score between its two snapshots, so it is only as accurate as the scoreboard reading at each sub.

## Considered Options

- **Running score**: +1/+2/+3 buttons for both teams on every basket. Exact, but turns the Recorder into a full scorekeeper.
- **Per-Shift points counters** (original schema): same tapping burden, and nothing to check against the scoreboard.

## Consequences

- Snapshots store absolute scores, never deltas, so correcting the strip from the scoreboard can't double-count the Athlete's points.
- The last snapshot is the Final Score, which the share card needs.
