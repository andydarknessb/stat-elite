-- Self-check for docs/schema.sql against a plain Postgres 15+.
-- Run: psql -v ON_ERROR_STOP=1 -f docs/schema.test.sql   (on a throwaway database)
-- Any failed expectation raises an exception and stops the run.

-- Minimal stand-in for the parts of Supabase the schema uses.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
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
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
insert into athletes (id, owner_id, name) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Casey'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Jordan');
insert into games (id, owner_id, athlete_id, sport, period_format, game_date) values
  ('20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'basketball', 'quarters', '2026-10-30'),
  ('20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'softball', 'innings', '2026-10-30'),
  ('20000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'basketball', 'halves', '2026-10-30');

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

-- Delete my account, signed in as A: everything of A's goes, B is untouched.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select delete_my_account();
reset role;
do $$
begin
  if exists (select 1 from events where owner_id = '00000000-0000-0000-0000-00000000000a') then raise exception 'A''s Events survived account deletion'; end if;
  if exists (select 1 from athletes where owner_id = '00000000-0000-0000-0000-00000000000a') then raise exception 'A''s Athletes survived account deletion'; end if;
  if (select count(*) from events) <> 1 then raise exception 'B''s Event should remain'; end if;
end $$;

\echo 'schema.test.sql: all checks passed'
