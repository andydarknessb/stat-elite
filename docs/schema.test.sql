-- Self-check for docs/schema.sql against a plain Postgres 15+.
-- Run: psql -v ON_ERROR_STOP=1 -f docs/schema.test.sql   (on a throwaway database)
-- Any failed expectation raises an exception and stops the run.

-- Minimal stand-in for the parts of Supabase the schema uses.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;

\ir schema.sql

grant select, insert, update, delete on athletes, games, events to authenticated;

create function pg_temp.expect_fail(stmt text, why text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected failure did not happen: %', why;
exception when others then
  if sqlerrm like 'expected failure did not happen:%' then raise; end if;
end $$;

-- Two owners: A (…a) and B (…b).
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c');
insert into athletes (id, owner_id, name) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Casey'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Jordan');
insert into games (id, owner_id, athlete_id, sport, period_format, game_date, recorded_by) values
  ('20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'basketball', 'quarters', '2026-10-30', '00000000-0000-0000-0000-00000000000a'),
  ('20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'softball', 'innings', '2026-10-30', '00000000-0000-0000-0000-00000000000a'),
  ('20000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'basketball', 'halves', '2026-10-30', '00000000-0000-0000-0000-00000000000b');

-- Happy path: a basketball Game with a Shift, a retracted Shot, and a Final Score.
insert into events (id, owner_id, game_id, seq, client_ts, period, type, court_x, court_y, shot_value, made, team_score, opponent_score, retracts_id) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 1, now(), 1, 'sub_in',     null, null, null, null, 0, 0, null),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 2, now(), 1, 'shot',       42.5, 18.0, 2, true, null, null, null),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 3, now(), 1, 'retraction', null, null, null, null, null, null, '30000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 4, now(), 1, 'free_throw', null, null, null, false, null, null, null),
  ('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 5, now(), 1, 'sub_out',    null, null, null, null, 8, 5, null),
  ('30000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 6, now(), 4, 'game_end',   null, null, null, null, 41, 37, null);
insert into events (id, owner_id, game_id, seq, client_ts, period, type, outcome, rbi) values
  ('30000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', 1, now(), 1, 'plate_appearance', 'double', 1);

-- The database rejects malformed rows.
select pg_temp.expect_fail($$insert into games (id, owner_id, athlete_id, sport, period_format, game_date) values ('20000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'basketball', 'innings', '2026-10-30')$$, 'basketball Game in innings');
select pg_temp.expect_fail($$insert into games (id, owner_id, athlete_id, sport, period_format, game_date) values ('20000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000b', 'basketball', 'halves', '2026-10-30')$$, 'Game for another owner''s Athlete');
select pg_temp.expect_fail($$insert into events (id, owner_id, game_id, seq, client_ts, period, type, court_y, shot_value, made) values ('30000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 99, now(), 1, 'shot', 10, 2, true)$$, 'Shot without court_x');
select pg_temp.expect_fail($$insert into events (id, owner_id, game_id, seq, client_ts, period, type, court_x, court_y, shot_value, made) values ('30000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 99, now(), 1, 'shot', 10, 10, 1, true)$$, 'Shot worth 1');
select pg_temp.expect_fail($$insert into events (id, owner_id, game_id, seq, client_ts, period, type) values ('30000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 99, now(), 1, 'retraction')$$, 'Retraction without a target');
select pg_temp.expect_fail($$insert into events (id, owner_id, game_id, seq, client_ts, period, type, retracts_id) values ('30000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 99, now(), 1, 'steal', '30000000-0000-0000-0000-000000000001')$$, 'non-Retraction pointing at an Event');
select pg_temp.expect_fail($$insert into events (id, owner_id, game_id, seq, client_ts, period, type, retracts_id) values ('30000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', 99, now(), 1, 'retraction', '30000000-0000-0000-0000-000000000001')$$, 'Retraction of an Event in another Game');
select pg_temp.expect_fail($$insert into events (id, owner_id, game_id, seq, client_ts, period, type) values ('30000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000a1', 99, now(), 1, 'steal')$$, 'Event owned by someone other than its Game''s owner');
select pg_temp.expect_fail($$insert into events (id, owner_id, game_id, seq, client_ts, period, type) values ('30000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 1, now(), 1, 'steal')$$, 'duplicate seq in one Game');
select pg_temp.expect_fail($$insert into events (id, owner_id, game_id, seq, client_ts, period, type, outcome) values ('30000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', 99, now(), 1, 'plate_appearance', 'single')$$, 'Plate Appearance without RBI');

-- Row-level security, signed in as B.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$
declare n int;
begin
  select count(*) into n from events;
  if n <> 0 then raise exception 'B can see % of A''s Events', n; end if;
  select count(*) into n from games;
  if n <> 1 then raise exception 'B should see exactly 1 Game, saw %', n; end if;
end $$;
insert into events (id, owner_id, game_id, seq, client_ts, period, type)
  values ('30000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000b1', 1, now(), 1, 'steal');
-- A re-upload of the same Event is a no-op, which is what the outbox relies on.
insert into events (id, owner_id, game_id, seq, client_ts, period, type)
  values ('30000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000b1', 1, now(), 1, 'steal')
  on conflict do nothing;
do $$
declare n int;
begin
  update events set type = 'block';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Events must not be editable, % updated', n; end if;
  delete from events;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Events must not be deletable, % deleted', n; end if;
end $$;
select pg_temp.expect_fail($$insert into athletes (id, owner_id, name) values ('10000000-0000-0000-0000-0000000000b9', '00000000-0000-0000-0000-00000000000a', 'Spoof')$$, 'B creating an Athlete owned by A');

-- Sharing (ADR 0004). A's Invites: one to accept, one already expired. B is a stranger to Casey throughout.
-- The server makes tokens and expiry, so these two are seeded the way it makes them: as superuser, past the grants.
reset role;
insert into invites (token, athlete_id, owner_id) values
  ('40000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a');
insert into invites (token, athlete_id, owner_id, expires_at) values
  ('40000000-0000-0000-0000-0000000000e0', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', now() - interval '1 second');
set role authenticated;

-- The Owner makes an Invite through the API, and cannot choose its expiry.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into invites (athlete_id, owner_id) values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_fail($$insert into invites (athlete_id, owner_id, expires_at) values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'infinity')$$, 'the Owner choosing an Invite''s expiry');
do $$
begin
  if (select expires_at - created_at from invites where token = '40000000-0000-0000-0000-00000000000a') <> interval '7 days' then
    raise exception 'an Invite should expire 7 days after it is made';
  end if;
end $$;
-- the Owner opening its own link is refused, and the link stays unused
select pg_temp.expect_fail($$select accept_invite('40000000-0000-0000-0000-00000000000a')$$, 'the Owner accepting its own Invite');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect_fail($$insert into invites (athlete_id, owner_id) values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')$$, 'B inviting to an Athlete it does not own');

-- C accepts: a Member reads Casey, its Games and its Events, and can make no Invite or Event.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select accept_invite('40000000-0000-0000-0000-00000000000a');
select accept_invite('40000000-0000-0000-0000-00000000000a');
select pg_temp.expect_fail($$select accept_invite('40000000-0000-0000-0000-0000000000e0')$$, 'an expired Invite accepted');
do $$
declare n int;
begin
  select count(*) into n from athletes;
  if n <> 1 then raise exception 'a Member should see the 1 Athlete it is a Member of, saw %', n; end if;
  select count(*) into n from games;
  if n <> 2 then raise exception 'a Member should see its Athlete''s 2 Games, saw %', n; end if;
  select count(*) into n from events;
  if n <> 7 then raise exception 'a Member should see its Athlete''s 7 Events, saw %', n; end if;
end $$;
select pg_temp.expect_fail($$insert into invites (athlete_id, owner_id) values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c')$$, 'a Member making an Invite');
select pg_temp.expect_fail($$insert into events (id, owner_id, game_id, seq, client_ts, period, type) values ('30000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 7, now(), 1, 'steal')$$, 'a Member adding an Event to a Game it did not record');

-- A Member records its own Game on Casey: the Game carries Casey's Owner and names the Member as its Recorder (ADR 0004).
insert into games (id, owner_id, athlete_id, sport, period_format, game_date, recorded_by) values
  ('20000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'basketball', 'quarters', '2026-10-31', '00000000-0000-0000-0000-00000000000c');
insert into events (id, owner_id, game_id, seq, client_ts, period, type) values
  ('30000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000c1', 1, now(), 1, 'steal');
-- and it can record nothing under another account's name: not as the Owner, not on an Athlete it is not a Member of, not as its own Owner
select pg_temp.expect_fail($$insert into games (id, owner_id, athlete_id, sport, period_format, game_date, recorded_by) values ('20000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'basketball', 'quarters', '2026-10-31', '00000000-0000-0000-0000-00000000000a')$$, 'a Game recorded by the Owner, inserted by a Member');
select pg_temp.expect_fail($$insert into games (id, owner_id, athlete_id, sport, period_format, game_date, recorded_by) values ('20000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000000a', 'basketball', 'quarters', '2026-10-31', '00000000-0000-0000-0000-00000000000c')$$, 'a Member''s Game under its own account as Owner');
select pg_temp.expect_fail($$insert into games (id, owner_id, athlete_id, sport, period_format, game_date, recorded_by) values ('20000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'basketball', 'halves', '2026-10-31', '00000000-0000-0000-0000-00000000000c')$$, 'a Member recording on an Athlete it is not a Member of');

-- The Owner does not add Events to the Game its Member recorded; it reads them.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.expect_fail($$insert into events (id, owner_id, game_id, seq, client_ts, period, type) values ('30000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000c1', 2, now(), 1, 'steal')$$, 'the Owner adding an Event to a Game its Member recorded');
do $$
declare n int;
begin
  select count(*) into n from events where game_id = '20000000-0000-0000-0000-0000000000c1';
  if n <> 1 then raise exception 'the Owner should see the Member''s Event, saw %', n; end if;
end $$;
-- The Owner cannot hand the Member's Game to itself: a Game keeps its Recorder. Its own edits to its Game still go through.
select pg_temp.expect_fail($$update games set recorded_by = '00000000-0000-0000-0000-00000000000a' where id = '20000000-0000-0000-0000-0000000000c1'$$, 'the Owner reassigning a Game to itself');
do $$
declare n int;
begin
  update games set opponent_name = 'Hawks' where id = '20000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'the Owner should update its own Game, updated %', n; end if;
end $$;

-- B, the stranger, still sees only its own rows, and cannot take the Invite C used.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect_fail($$select accept_invite('40000000-0000-0000-0000-00000000000a')$$, 'a second account accepting a used Invite');
do $$
declare n int;
begin
  select count(*) into n from athletes;
  if n <> 1 then raise exception 'a stranger should see only its own Athlete, saw %', n; end if;
  select count(*) into n from games;
  if n <> 1 then raise exception 'a stranger should see only its own Game, saw %', n; end if;
  select count(*) into n from events;
  if n <> 1 then raise exception 'a stranger should see only its own Event, saw %', n; end if;
end $$;

-- A Member edits its Athlete's name and number, and cannot hand the Athlete to itself (ADR 0004). C is Casey's Member here.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$
declare n int;
begin
  update athletes set name = 'Casey Member' where id = '10000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'a Member should rename its Athlete, updated % rows', n; end if;
  if (select name from athletes where id = '10000000-0000-0000-0000-00000000000a') <> 'Casey Member' then
    raise exception 'a Member''s rename should read back';
  end if;
end $$;
-- Casey has Games, and a Game's foreign key refuses an owner_id change under any policy, so the owner check runs on an
-- Athlete of A's with none, that C is a Member of.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into athletes (id, owner_id, name) values ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000a', 'Riley');
reset role;
insert into members (athlete_id, member_id) values ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000c');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select pg_temp.expect_fail($$update athletes set owner_id = '00000000-0000-0000-0000-00000000000c' where id = '10000000-0000-0000-0000-0000000000e1'$$, 'a Member taking over its Athlete''s owner_id');
do $$
begin
  if (select owner_id from athletes where id = '10000000-0000-0000-0000-0000000000e1') <> '00000000-0000-0000-0000-00000000000a' then
    raise exception 'a Member''s refused owner_id change should leave the Owner in place';
  end if;
end $$;
-- A stranger renames nothing: B is not a Member of Casey.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$
declare n int;
begin
  update athletes set name = 'Casey Stranger' where id = '10000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'a stranger renamed % Athletes', n; end if;
end $$;
-- The Owner renames its own Athlete, and removes the Athlete it made for the check (its Member goes with it).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare n int;
begin
  update athletes set name = 'Casey Owner' where id = '10000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'the Owner should rename its Athlete, updated % rows', n; end if;
  delete from athletes where id = '10000000-0000-0000-0000-0000000000e1';
end $$;

-- Removing a Member and leaving (ADR 0004). D joins Casey the way an Invite makes a Member, so Casey has two: C and D.
reset role;
insert into auth.users values ('00000000-0000-0000-0000-00000000000d');
insert into members (athlete_id, member_id) values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d');
set role authenticated;

-- Only the Owner removes a Member: a stranger and a Member remove nothing, and the Owner sees both Members.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$
declare n int;
begin
  delete from members where athlete_id = '10000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'a stranger removed % Members', n; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
do $$
declare n int;
begin
  delete from members where athlete_id = '10000000-0000-0000-0000-00000000000a' and member_id = '00000000-0000-0000-0000-00000000000c';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'a Member removed another Member: % rows', n; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare n int;
begin
  select count(*) into n from members where athlete_id = '10000000-0000-0000-0000-00000000000a';
  if n <> 2 then raise exception 'the Owner should see its 2 Members, saw %', n; end if;
  delete from members where athlete_id = '10000000-0000-0000-0000-00000000000a' and member_id = '00000000-0000-0000-0000-00000000000d';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'the Owner should remove its Member, removed % rows', n; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
do $$
declare n int;
begin
  select count(*) into n from athletes;
  if n <> 0 then raise exception 'a removed Member should see no Athlete, saw %', n; end if;
end $$;

-- C leaves Casey: a Member deletes its own membership and nothing of its Athlete's.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$
declare n int;
begin
  delete from members where athlete_id = '10000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'a Member should leave, removed % rows', n; end if;
  select count(*) into n from athletes;
  if n <> 0 then raise exception 'a departed Member should see no Athlete, saw %', n; end if;
  select count(*) into n from games;
  if n <> 0 then raise exception 'a departed Member should see no Game, saw %', n; end if;
  select count(*) into n from events;
  if n <> 0 then raise exception 'a departed Member should see no Event, saw %', n; end if;
end $$;
-- A departed Member records nothing more, not even on a Game it recorded before it left.
select pg_temp.expect_fail($$insert into events (id, owner_id, game_id, seq, client_ts, period, type) values ('30000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000c1', 3, now(), 1, 'steal')$$, 'a departed Member adding an Event to the Game it recorded');

-- The Games a Member recorded stay with the Athlete; the Owner keeps them and their Recorder link (ADR 0004).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare n int;
begin
  select count(*) into n from members where athlete_id = '10000000-0000-0000-0000-00000000000a';
  if n <> 0 then raise exception 'the Owner should see no Members left, saw %', n; end if;
  select count(*) into n from games where athlete_id = '10000000-0000-0000-0000-00000000000a';
  if n <> 3 then raise exception 'the Owner should keep its 3 Games, saw %', n; end if;
  if (select recorded_by from games where id = '20000000-0000-0000-0000-0000000000c1') <> '00000000-0000-0000-0000-00000000000c' then
    raise exception 'a departed Member''s Game should keep its Recorder';
  end if;
end $$;
set role authenticated;

-- A Member deleting its account clears the Recorder link on the Games it recorded; the Games stay with the Athlete (ADR 0004).
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-00000000000c';
do $$
begin
  if (select recorded_by from games where id = '20000000-0000-0000-0000-0000000000c1') is not null then
    raise exception 'a deleted Member''s Game should lose its Recorder';
  end if;
  -- and nothing else: the Game keeps its Owner and Athlete, and its Event stays
  if not exists (select 1 from games where id = '20000000-0000-0000-0000-0000000000c1'
                 and owner_id = '00000000-0000-0000-0000-00000000000a' and athlete_id = '10000000-0000-0000-0000-00000000000a') then
    raise exception 'a deleted Member''s Game should stay with its Owner and Athlete';
  end if;
  if not exists (select 1 from events where id = '30000000-0000-0000-0000-0000000000c2') then
    raise exception 'a deleted Member''s Event should stay with its Game';
  end if;
end $$;
set role authenticated;

-- A Member's sign-in email (ADR 0004): B, which has its own Athlete, accepts an Invite to Casey, and the Owner reads
-- the email B signed in with on B's membership row.
reset role;
update auth.users set email = 'b@example.com' where id = '00000000-0000-0000-0000-00000000000b';
insert into invites (token, athlete_id, owner_id) values ('40000000-0000-0000-0000-0000000000b0', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select accept_invite('40000000-0000-0000-0000-0000000000b0');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
begin
  if (select email from members where member_id = '00000000-0000-0000-0000-00000000000b') is distinct from 'b@example.com' then
    raise exception 'the Owner should read the sign-in email a Member accepted with';
  end if;
end $$;

-- A second Member joins Casey after B, so B is the one who joined first (ADR 0004).
reset role;
insert into auth.users values ('00000000-0000-0000-0000-00000000000e');
insert into invites (token, athlete_id, owner_id) values ('40000000-0000-0000-0000-0000000000e5', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
select accept_invite('40000000-0000-0000-0000-0000000000e5');
-- Morgan is A's alone: with no Members it goes with A's account, its Game and its Event.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into athletes (id, owner_id, name) values ('10000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'Morgan');
insert into games (id, owner_id, athlete_id, sport, period_format, game_date, recorded_by) values ('20000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000f1', 'basketball', 'quarters', '2026-10-31', '00000000-0000-0000-0000-00000000000a');
insert into events (id, owner_id, game_id, seq, client_ts, period, type) values ('30000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000f1', 1, now(), 1, 'steal');
-- Casey's Events as they are before the deletion, owner left out, to compare after it.
reset role;
create temp table casey_events as
  select e.id, to_jsonb(e) - 'owner_id' as content from events e join games g on g.id = e.game_id
  where g.athlete_id = '10000000-0000-0000-0000-00000000000a';

-- Delete my account, signed in as A (ADR 0004): Casey passes to B with its Games and Events, E stays a Member of it,
-- and Morgan goes with A.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select delete_my_account();
reset role;
do $$
declare n int;
begin
  if (select owner_id from athletes where id = '10000000-0000-0000-0000-00000000000a') is distinct from '00000000-0000-0000-0000-00000000000b' then
    raise exception 'Casey should pass to B, the Member who joined first';
  end if;
  if (select count(*) from games where athlete_id = '10000000-0000-0000-0000-00000000000a' and owner_id = '00000000-0000-0000-0000-00000000000b') <> 3 then
    raise exception 'Casey''s 3 Games should pass to B with it';
  end if;
  select count(*) into n from events e join games g on g.id = e.game_id
    where g.athlete_id = '10000000-0000-0000-0000-00000000000a' and e.owner_id = '00000000-0000-0000-0000-00000000000b';
  if n <> 8 then raise exception 'Casey''s 8 Events should pass to B with it, saw %', n; end if;
  select count(*) into n from casey_events c join events e on e.id = c.id where to_jsonb(e) - 'owner_id' = c.content;
  if n <> 8 then raise exception 'Casey''s Events should keep their contents, % of 8 match', n; end if;
  -- B is the Owner now, so it is no Member of Casey; E, which joined later, stays one
  if (select array_agg(member_id) from members where athlete_id = '10000000-0000-0000-0000-00000000000a')
     is distinct from array['00000000-0000-0000-0000-00000000000e'::uuid] then
    raise exception 'Casey should keep only E as a Member once B is its Owner';
  end if;
  if exists (select 1 from athletes where id = '10000000-0000-0000-0000-0000000000f1')
     or exists (select 1 from games where id = '20000000-0000-0000-0000-0000000000f1')
     or exists (select 1 from events where id = '30000000-0000-0000-0000-0000000000f1') then
    raise exception 'Morgan, its Game and its Event should go with A';
  end if;
  if exists (select 1 from athletes where owner_id = '00000000-0000-0000-0000-00000000000a')
     or exists (select 1 from events where owner_id = '00000000-0000-0000-0000-00000000000a') then
    raise exception 'A''s rows survived account deletion';
  end if;
  if (select count(*) from events) <> 9 then
    raise exception 'B''s Event and Casey''s 8 should remain, saw %', (select count(*) from events);
  end if;
end $$;
-- The Events that came with Casey are not editable by their new Owner either (ADR 0004).
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$
declare n int;
begin
  update events set type = 'block' where owner_id = '00000000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Events must not be editable by their Owner, % updated', n; end if;
end $$;
reset role;

\echo 'schema.test.sql: all checks passed'
