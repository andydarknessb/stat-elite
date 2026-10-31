-- StatElite database schema (Supabase / PostgreSQL).
-- Terms: GLOSSARY.md. Decisions: docs/adr/0001-0003.
-- IDs are generated on the Recorder's phone (ADR 0001), so id columns have no default.

create table athletes (
  id            uuid primary key,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  jersey_number text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),  -- set by the phone; latest edit wins (ADR 0001)
  unique (id, owner_id)
);

create table games (
  id             uuid primary key,
  owner_id       uuid not null references auth.users (id) on delete cascade,
  athlete_id     uuid not null,
  sport          text not null check (sport in ('basketball', 'softball', 'baseball')),
  period_format  text not null check (period_format in ('halves', 'quarters', 'innings')),
  opponent_name  text not null default 'Opponent',
  location_label text,
  game_date      date not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),  -- set by the phone; latest edit wins (ADR 0001)
  unique (id, owner_id),
  -- a Game can only belong to an Athlete with the same owner
  foreign key (athlete_id, owner_id) references athletes (id, owner_id) on delete cascade,
  check ((sport = 'basketball') = (period_format in ('halves', 'quarters')))
);

-- One table for every sport (ADR 0003). Sport-specific columns are null unless the type needs them.
create table events (
  id             uuid primary key,
  owner_id       uuid not null,
  game_id        uuid not null,
  seq            int not null check (seq >= 1),
  client_ts      timestamptz not null,
  period         int not null check (period >= 1),
  type           text not null check (type in (
                   'period_start', 'score', 'game_end', 'retraction',
                   'shot', 'free_throw', 'reb_off', 'reb_def', 'assist', 'steal',
                   'block', 'turnover', 'foul', 'sub_in', 'sub_out',
                   'pitch', 'plate_appearance', 'baserunning')),
  retracts_id    uuid,
  -- basketball
  court_x        numeric(5,2) check (court_x between 0 and 100),
  court_y        numeric(5,2) check (court_y between 0 and 100),
  shot_value     int check (shot_value in (2, 3)),
  made           boolean,
  -- Score Snapshot
  team_score     int check (team_score >= 0),
  opponent_score int check (opponent_score >= 0),
  -- softball and baseball
  pitch          text check (pitch in ('ball', 'called_strike', 'swinging_strike', 'foul')),
  outcome        text check (outcome in (
                   'single', 'double', 'triple', 'home_run',
                   'walk', 'hit_by_pitch', 'reached_on_error', 'fielders_choice',
                   'strikeout', 'ground_out', 'fly_out', 'line_out',
                   'sac_fly', 'sac_bunt')),
  rbi            int check (rbi between 0 and 4),
  base           text check (base in ('second', 'third', 'home', 'out')),
  stolen         boolean,
  unique (game_id, seq),
  unique (id, game_id),
  -- an Event can only belong to a Game with the same owner
  foreign key (game_id, owner_id) references games (id, owner_id) on delete cascade,
  -- a Retraction can only cancel an Event in the same Game
  foreign key (retracts_id, game_id) references events (id, game_id) on delete cascade,
  check ((type = 'retraction') = (retracts_id is not null)),
  check (case
    when type = 'shot' then court_x is not null and court_y is not null and shot_value is not null and made is not null
    when type = 'free_throw' then made is not null
    when type in ('sub_in', 'sub_out', 'score', 'game_end') then team_score is not null and opponent_score is not null
    when type = 'pitch' then pitch is not null
    when type = 'plate_appearance' then outcome is not null and rbi is not null
    when type = 'baserunning' then base is not null and stolen is not null
    else true
  end)
);

create index on athletes (owner_id);
create index on games (owner_id);
create index on games (athlete_id);
create index on events (owner_id);
create index on events (retracts_id) where retracts_id is not null;

-- Row-level security: every row belongs to its owner, no joins.
-- This is the M1 access model. ADR 0004 replaces it in M3 (Owner-or-Member access,
-- the recording account on Games, ownership transfer in delete_my_account).
alter table athletes enable row level security;
alter table games    enable row level security;
alter table events   enable row level security;

create policy own_athletes on athletes for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_games on games for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Events are never edited (ADR 0001): select and insert only.
-- The outbox uploads with upsert({ ignoreDuplicates: true }), which needs insert only.
create policy read_own_events on events for select to authenticated
  using (owner_id = (select auth.uid()));
create policy add_own_events on events for insert to authenticated
  with check (owner_id = (select auth.uid()));

-- "Delete my account and all data": removing the auth user cascades to every row.
create function delete_my_account() returns void
language sql security definer set search_path = ''
as $$ delete from auth.users where id = (select auth.uid()); $$;

revoke execute on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;
