# StatElite

A phone app a parent uses on the sideline to record one child's games, then share and learn from them.

## People

**Athlete**:
The child whose games are recorded. Every Game belongs to exactly one Athlete.
_Avoid_: player, kid, profile, child

**Owner**:
The account an Athlete belongs to, with sole say over its Members and its deletion.
_Avoid_: admin, creator

**Member**:
An account invited to share an Athlete. A Member sees every Game of that Athlete, can record new ones, and edits the Athlete's name and number.
_Avoid_: co-parent (outside UI copy), collaborator, guest, viewer

**Invite**:
A link that makes whoever accepts it a Member of one Athlete.
_Avoid_: share link, invitation code

**Recorder**:
The person whose phone records a Game. Each Game has exactly one Recorder.
_Avoid_: user, parent, scorekeeper, tracker

## Games

**Game**:
One contest the Athlete plays in, from first Event to Final Score.
_Avoid_: match, session, contest

**Team**:
The side the Athlete plays for.
_Avoid_: us, home

**Opponent**:
The side the Athlete's Team plays against.
_Avoid_: them, away, other team

**Score Snapshot**:
The Team and Opponent scores as read off the scoreboard at one moment.
_Avoid_: score update, scoreboard entry

**Final Score**:
The Score Snapshot taken when the Game ends.
_Avoid_: result

**Period**:
One segment of a Game: a quarter, a half, an overtime, or an inning.
_Avoid_: game period, segment

**Event**:
One thing the Athlete did in a Game, as entered by the Recorder.
_Avoid_: action, stat, play, telemetry

**Undo**:
Retracting the most recent Events, newest first. A retracted Event no longer counts toward any stat.
_Avoid_: delete, cancel

**Retraction**:
An Event recording that an earlier Event was undone.
_Avoid_: deletion, tombstone

## Basketball

**Shot**:
A field-goal attempt: a spot on the court, a result (make or miss), and a value of 2 or 3.
_Avoid_: FG, attempt

**Free Throw**:
A one-point attempt from the line, recorded with a result and no spot.
_Avoid_: foul shot

**Shift**:
One continuous stretch with the Athlete on the court, from Sub In to Sub Out.
_Avoid_: stint, rotation

**Sub In / Sub Out**:
The Events marking the Athlete entering and leaving the court. Each carries a Score Snapshot.
_Avoid_: substitution, check in

**Plus/Minus**:
Points the Team scored minus points the Opponent scored, counted only during the Athlete's Shifts.
_Avoid_: net rating, impact score

**Playing Share**:
The fraction of a Game's elapsed time the Athlete spent in Shifts.
_Avoid_: minutes played, playing time

## Softball and Baseball

**Plate Appearance**:
One turn the Athlete takes at bat, ending in an Outcome.
_Avoid_: PA, at-bat (that's a narrower term)

**At-Bat**:
A Plate Appearance that counts toward batting average: any except a Walk, Hit by Pitch, Sac Fly, or Sac Bunt.
_Avoid_: AB, turn at bat

**Outcome**:
How a Plate Appearance ended: a hit, a reach (Walk, Hit by Pitch, Error, Fielder's Choice), an out, or a sacrifice.
_Avoid_: result, play

**Pitch**:
One ball, strike, or foul thrown to the Athlete during a Plate Appearance. A foul is a strike only while the Count has fewer than two strikes; with two, it leaves the Count as it was. Recording Pitches is optional.
_Avoid_: count entry

**Count**:
The balls and strikes of the Plate Appearance in progress. It shows once a Pitch is logged in that Plate Appearance, and resets at each Outcome and each new Period.
_Avoid_: pitch count, B-S

**Strikeout looking**:
A strikeout whose last called or swinging strike was a called strike. It follows from the Pitches and is never recorded on its own; the Outcome stays Strikeout.
_Avoid_: called strikeout, K looking

**Strikeout swinging**:
A strikeout whose last called or swinging strike was a swinging strike. It follows from the Pitches and is never recorded on its own; the Outcome stays Strikeout.
_Avoid_: swinging K

**RBI**:
A run that scored because of the Athlete's Plate Appearance, as counted by the Recorder.
_Avoid_: runs batted in

**Baserunning**:
One move of the Athlete once on base: to 2nd, 3rd, Scored or Out, marked Stole or not. Scored counts a run; a move marked Stole counts a stolen base.
_Avoid_: runner, base event

## Insights

**Practice Focus**:
Drill recommendations drawn from the Athlete's recent Games.
_Avoid_: insights, practice insights, recommendations

**Zone**:
One of the places a Shot counts for Practice Focus: `rim` under 8 ft from the basket, or `mid` or `three` by the Shot's value, each on the `left`, `center` or `right` by its spot across the court.
_Avoid_: area, section, region

## App

**Button Size**:
How large the live-game buttons are: Compact, Standard, or Bleacher.
_Avoid_: Bleacher Mode, Oversized, target resizing
