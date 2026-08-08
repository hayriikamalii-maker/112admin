create table if not exists public.app_state_snapshots (
  id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state_snapshots enable row level security;

drop policy if exists "anon can read app state snapshots" on public.app_state_snapshots;
drop policy if exists "anon can write app state snapshots" on public.app_state_snapshots;

create policy "anon can read app state snapshots"
on public.app_state_snapshots
for select
to anon
using (true);

create policy "anon can write app state snapshots"
on public.app_state_snapshots
for all
to anon
using (true)
with check (true);

insert into public.app_state_snapshots (id, state)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;
