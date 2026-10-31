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
