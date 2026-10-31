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
-- ADR 0004: an Athlete is shared with Members through Invites. A Member is made only by accept_invite(), below.
create table members (
  athlete_id uuid not null references athletes (id) on delete cascade,
  member_id  uuid not null references auth.users (id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (athlete_id, member_id)
);
create index on members (member_id);

create table invites (
  token      uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  -- the account that accepted the Invite: it works once
  used_by    uuid references auth.users (id) on delete cascade
);

-- Owner-or-Member read access (ADR 0004). Not yet: writes by a Member, and the recording account on Games.
alter table members enable row level security;
alter table invites enable row level security;

create policy member_reads_athletes on athletes for select to authenticated
  using (exists (select 1 from members m where m.athlete_id = athletes.id and m.member_id = (select auth.uid())));
create policy member_reads_games on games for select to authenticated
  using (exists (select 1 from members m where m.athlete_id = games.athlete_id and m.member_id = (select auth.uid())));
create policy member_reads_events on events for select to authenticated
  using (exists (select 1 from games g join members m on m.athlete_id = g.athlete_id
                 where g.id = events.game_id and m.member_id = (select auth.uid())));

-- A Member sees its own memberships. The Owner's list of Members comes with the Members screen.
create policy read_own_membership on members for select to authenticated
  using (member_id = (select auth.uid()));

-- Only the Owner of an Athlete makes an Invite, and reads back the Invites it made.
create policy own_invites_read on invites for select to authenticated
  using (owner_id = (select auth.uid()));
create policy own_invites_add on invites for insert to authenticated
  with check (owner_id = (select auth.uid())
    and exists (select 1 from athletes a where a.id = invites.athlete_id and a.owner_id = (select auth.uid())));

-- The Owner names the Athlete and itself; the token, expiry and use are the server's (ADR 0004).
revoke all on invites from authenticated;
grant select on invites to authenticated;
grant insert (athlete_id, owner_id) on invites to authenticated;
grant select on members to authenticated;

-- Accepts an Invite for the signed-in account and returns its Athlete.
-- Refuses with invite_unknown, invite_own, invite_used or invite_expired.
create function accept_invite(invite_token uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  invite public.invites%rowtype;
begin
  select * into invite from public.invites where token = invite_token for update;
  if not found then raise exception 'invite_unknown'; end if;
  -- the Owner opening its own link is refused, and the link stays unused for a co-parent
  if invite.owner_id = me then raise exception 'invite_own'; end if;
  -- the account that accepted it may accept again (a retry after a failed download); any other is refused
  if invite.used_by = me then return invite.athlete_id; end if;
  if invite.used_by is not null then raise exception 'invite_used'; end if;
  if invite.expires_at <= now() then raise exception 'invite_expired'; end if;
  insert into public.members (athlete_id, member_id) values (invite.athlete_id, me) on conflict do nothing;
  update public.invites set used_by = me where token = invite_token;
  return invite.athlete_id;
end $$;

revoke execute on function accept_invite(uuid) from public, anon;
grant execute on function accept_invite(uuid) to authenticated;
-- ADR 0004: a Member records Games too. A Game names the account that records it (its Recorder), and only that
-- account adds Events to it (ADR 0001: one Recorder per Game, now enforced on the server).
-- A Game recorded before this migration was recorded by its Owner.
alter table games add column recorded_by uuid references auth.users (id) on delete set null;
update games set recorded_by = owner_id;

-- A Game is inserted by the account that records it: the Owner, or a Member of its Athlete. The Owner's insert
-- still passes own_games; this restrictive policy makes every insert name its inserter as Recorder.
create policy games_inserted_by_recorder on games as restrictive for insert to authenticated
  with check (recorded_by = (select auth.uid()));
create policy member_records_games on games for insert to authenticated
  with check (exists (select 1 from members m where m.athlete_id = games.athlete_id and m.member_id = (select auth.uid())));

-- Only a Game's Recorder adds Events to it. The Event's owner is the Game's, by the foreign key on (game_id, owner_id).
drop policy add_own_events on events;
create policy recorder_adds_events on events for insert to authenticated
  with check (exists (select 1 from games g where g.id = events.game_id and g.recorded_by = (select auth.uid())));

-- A Game keeps its Recorder: the Owner's own update policy would otherwise let it hand a Member's Game to itself.
-- Clearing it is allowed: a Member's deleted account leaves its Games with the Athlete, unlinked (ADR 0004).
create function keep_recorder() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.recorded_by is not null and new.recorded_by is distinct from old.recorded_by then
    raise exception 'a Game keeps its Recorder';
  end if;
  return new;
end $$;

create trigger games_keep_recorder before update on games for each row execute function keep_recorder();
-- ADR 0004: the Owner removes a Member, and a Member leaves. Each deletes a membership row and nothing else, so the
-- Games a Member recorded stay with the Athlete.

-- Whether the account owns the Athlete. Security definer, so the policies on members do not recurse through athletes' policies.
create function owns_athlete(athlete uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.athletes a where a.id = athlete and a.owner_id = (select auth.uid())) $$;

revoke execute on function owns_athlete(uuid) from public, anon;
grant execute on function owns_athlete(uuid) to authenticated;

grant delete on members to authenticated;

-- The Owner sees its Athlete's Members, for the Members list, and removes one; a Member deletes only its own membership.
create policy owner_reads_members on members for select to authenticated
  using (owns_athlete(members.athlete_id));
create policy owner_removes_members on members for delete to authenticated
  using (owns_athlete(members.athlete_id));
create policy member_leaves on members for delete to authenticated
  using (member_id = (select auth.uid()));
