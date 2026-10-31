-- ADR 0004: the Owner's Members list names each Member by the sign-in email it accepted an Invite with. A Member made
-- before this migration is named by its account's email now.
alter table members add column email text;
update members set email = u.email from auth.users u where u.id = members.member_id;

-- accept_invite records the accepting account's sign-in email with its membership; otherwise as before.
create or replace function accept_invite(invite_token uuid) returns uuid
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
  insert into public.members (athlete_id, member_id, email)
    values (invite.athlete_id, me, (select u.email from auth.users u where u.id = me)) on conflict do nothing;
  update public.invites set used_by = me where token = invite_token;
  return invite.athlete_id;
end $$;
