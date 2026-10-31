-- ADR 0004: a Member edits its Athlete's name and number. A Member updates an Athlete it is a Member of, and a restrictive
-- policy keeps its owner_id as the stored one. The check runs through a security definer function, as owns_athlete does, so
-- the policy on athletes does not recurse through athletes' own policies, and a caller learns only yes or no, not the owner.
create function athlete_has_owner(athlete uuid, account uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.athletes a where a.id = athlete and a.owner_id = account) $$;

revoke execute on function athlete_has_owner(uuid, uuid) from public, anon;
grant execute on function athlete_has_owner(uuid, uuid) to authenticated;

create policy member_updates_athletes on athletes for update to authenticated
  using (exists (select 1 from members m where m.athlete_id = athletes.id and m.member_id = (select auth.uid())))
  with check (exists (select 1 from members m where m.athlete_id = athletes.id and m.member_id = (select auth.uid())));

-- Permissive policies are OR-ed, so the owner's check cannot pin a Member's owner_id; this restrictive one is ANDed with them.
create policy owner_id_unchanged on athletes as restrictive for update to authenticated
  using (true) with check (athlete_has_owner(athletes.id, athletes.owner_id));
