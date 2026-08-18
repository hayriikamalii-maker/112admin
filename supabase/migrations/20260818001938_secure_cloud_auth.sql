create table if not exists public.app_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  role text not null default 'user' check (role in ('admin', 'user')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_members enable row level security;
alter table public.app_state_snapshots enable row level security;

drop policy if exists "anon can read app state snapshots" on public.app_state_snapshots;
drop policy if exists "anon can write app state snapshots" on public.app_state_snapshots;
drop policy if exists "members can read app state" on public.app_state_snapshots;
drop policy if exists "members can insert app state" on public.app_state_snapshots;
drop policy if exists "members can update app state" on public.app_state_snapshots;
drop policy if exists "members can delete app state" on public.app_state_snapshots;

create policy "members can read app state"
on public.app_state_snapshots for select to authenticated
using (
  id = 'main' and exists (
    select 1 from public.app_members
    where user_id = auth.uid() and active
  )
);

create policy "members can insert app state"
on public.app_state_snapshots for insert to authenticated
with check (
  id = 'main' and exists (
    select 1 from public.app_members
    where user_id = auth.uid() and active
  )
);

create policy "members can update app state"
on public.app_state_snapshots for update to authenticated
using (
  id = 'main' and exists (
    select 1 from public.app_members
    where user_id = auth.uid() and active
  )
)
with check (
  id = 'main' and exists (
    select 1 from public.app_members
    where user_id = auth.uid() and active
  )
);

create policy "members can delete app state"
on public.app_state_snapshots for delete to authenticated
using (
  id = 'main' and exists (
    select 1 from public.app_members
    where user_id = auth.uid() and active
  )
);

revoke all on table public.app_state_snapshots from anon;
grant select, insert, update, delete on table public.app_state_snapshots to authenticated;

revoke all on table public.app_members from anon, authenticated;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;
