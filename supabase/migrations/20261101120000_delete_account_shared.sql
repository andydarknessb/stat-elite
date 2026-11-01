-- ADR 0004: an Owner who deletes its account passes each shared Athlete, with its Games and Events, to the Member who
-- joined first, and that Member's membership ends there, since it is the Owner now. One statement moves all three; the
-- same-owner keys (ADR 0003) hold at its end, so the order of the updates does not matter. Athletes with no Members go
-- with the account, as before. A Member's deletion still only clears the Recorder link on the Games it recorded.
create or replace function delete_my_account() returns void
language sql security definer set search_path = ''
as $$
  with heirs as (
    select distinct on (m.athlete_id) m.athlete_id, m.member_id as heir
    from public.members m join public.athletes a on a.id = m.athlete_id
    where a.owner_id = (select auth.uid())
    order by m.athlete_id, m.joined_at, m.member_id
  ), moved_athletes as (
    -- stamped, so the heir's phone takes the new owner at its next download (latest edit wins, ADR 0001)
    update public.athletes a set owner_id = h.heir, updated_at = now() from heirs h where a.id = h.athlete_id returning a.id
  ), moved_games as (
    update public.games g set owner_id = h.heir from heirs h where g.athlete_id = h.athlete_id returning g.id
  ), moved_events as (
    update public.events e set owner_id = h.heir
    from public.games g join heirs h on h.athlete_id = g.athlete_id
    where e.game_id = g.id returning e.id
  )
  delete from public.members m using heirs h where m.athlete_id = h.athlete_id and m.member_id = h.heir;
  delete from auth.users where id = (select auth.uid());
$$;
