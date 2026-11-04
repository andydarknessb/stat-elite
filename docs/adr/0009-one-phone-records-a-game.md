# One Phone records a Game

ADR 0001 promised that Events from two phones never mix, but App Core and the server only checked the Account, so a second Phone on that Account could open a live Game. Both Phones then gave different Events the same sequence number, the server refused the second, and that Phone's outbox stopped at the row for good. Only the Phone that started a Game now writes its Events: its Recording Phone. This tightens ADR 0001 and ADR 0004.

## Considered Options

- **Taking a Game over on another Phone:** a Phone that dies mid-Game could hand off, but it may still hold Events it has not uploaded, which brings back the conflict resolution ADR 0001 ruled out.
- **Showing a Game in progress on other Phones:** v1 has no live viewing, and a notice would stay forever for a Phone that never returns.

## Consequences

- A Game in progress is invisible on every other Phone. If its Recording Phone returns, its rows upload and nothing is lost.
- A Game whose Recording Phone never returns stays unfinished on the server and shows nowhere. Its Recorder enters it as a Backlogged Game.
- A Game started in Safari doesn't follow the Recorder into the home-screen app, since those are two Phones.
- A Backlogged Game has no Recording Phone. Its Recorder edits it from any Phone, and ADR 0006's second-phone risk stays.
- The server can't tell Phones apart, so App Core alone keeps this rule. On the server, ADR 0004's check that only the Recorder's Account adds Events stays as it is.
