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
