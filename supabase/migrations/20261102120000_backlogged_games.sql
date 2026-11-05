-- ADR 0005: a Backlogged Game keeps its Totals on the Game, and its Recorder edits them.
alter table games add column totals jsonb
  check (totals is null or (jsonb_typeof(totals) = 'object' and totals ? 'team' and totals ? 'opponent'));

-- A Recorder updates its Game only while it is still a Member of the Athlete. A removed Member's update matches no row and reports no error.
create policy recorder_updates_games on games for update to authenticated
  using (recorded_by = (select auth.uid()) and exists (select 1 from members m where m.athlete_id = games.athlete_id and m.member_id = (select auth.uid())))
  with check (recorded_by = (select auth.uid()) and exists (select 1 from members m where m.athlete_id = games.athlete_id and m.member_id = (select auth.uid())));

-- A Recorder can now update its Game, so the Game stays with its Athlete. The foreign key keeps owner_id matched to that Athlete.
create function keep_athlete() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.athlete_id is distinct from old.athlete_id then
    raise exception 'a Game keeps its Athlete';
  end if;
  return new;
end $$;

create trigger games_keep_athlete before update on games for each row execute function keep_athlete();
