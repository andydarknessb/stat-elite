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

-- A departed Member records nothing more: a Recorder adds Events only while its account still has the Athlete (ADR 0004).
drop policy recorder_adds_events on events;
create policy recorder_adds_events on events for insert to authenticated
  with check (exists (select 1 from games g where g.id = events.game_id and g.recorded_by = (select auth.uid())
    and (g.owner_id = (select auth.uid())
      or exists (select 1 from members m where m.athlete_id = g.athlete_id and m.member_id = (select auth.uid())))));
