alter table public.app_members add column if not exists station_ids text[] not null default '{}'::text[];

alter table public.app_members alter column role set default 'station_manager';
alter table public.app_members drop constraint if exists app_members_role_check;
update public.app_members set role = 'station_manager' where role = 'user';
alter table public.app_members add constraint app_members_role_check
  check (role in ('admin', 'station_manager', 'ysp_manager', 'driver_manager'));

with snapshot_users as (
  select user_item->>'username' as username,
         coalesce(array(select jsonb_array_elements_text(user_item->'stationIds')), '{}'::text[]) as station_ids
  from public.app_state_snapshots snapshot,
       lateral jsonb_array_elements(snapshot.state->'users') user_item
  where snapshot.id = 'main'
)
update public.app_members member
set station_ids = snapshot_users.station_ids
from snapshot_users
where member.username = snapshot_users.username;

update auth.users auth_user
set raw_app_meta_data = coalesce(auth_user.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('app_role', member.role)
from public.app_members member
where member.user_id = auth_user.id;

create schema if not exists private;

create or replace function private.can_read_activity_log(target_username text)
returns boolean
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  caller public.app_members%rowtype;
  target public.app_members%rowtype;
begin
  if (select auth.uid()) is null then return false; end if;
  select * into caller from public.app_members where user_id = (select auth.uid()) and active;
  if caller.user_id is null then return false; end if;
  if caller.role = 'admin' then return true; end if;
  if target_username = caller.username then return caller.role = 'station_manager'; end if;
  if caller.role <> 'station_manager' then return false; end if;
  select * into target from public.app_members where username = target_username and active;
  return target.role in ('ysp_manager', 'driver_manager') and caller.station_ids && target.station_ids;
end;
$$;

revoke all on function private.can_read_activity_log(text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.can_read_activity_log(text) to authenticated;

drop policy if exists "admins read all activity" on public.user_activity_logs;
drop policy if exists "authorized managers read scoped activity" on public.user_activity_logs;
create policy "authorized managers read scoped activity"
on public.user_activity_logs for select to authenticated
using ((select private.can_read_activity_log(username)));

create index if not exists app_members_station_ids_idx on public.app_members using gin (station_ids);
