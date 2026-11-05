-- ADR 0008: a Recorder removes any finished Game, so a removed Game no longer needs Totals. The server cannot tell a finished Game from one whose Events have not uploaded yet, so App Core alone keeps a Game in progress from being removed.
alter table games drop constraint games_check1;
