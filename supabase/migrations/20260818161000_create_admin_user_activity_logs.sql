create table if not exists public.user_activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  username text not null check (char_length(username) between 1 and 80),
  occurred_at timestamptz not null default now(),
  action_type text not null check (action_type in ('login','logout','navigation','click','change','save','create','update','delete','export','import','ai','other')),
  action_label text not null check (char_length(action_label) between 1 and 240),
  route text not null default '/',
  target text,
  details jsonb not null default '{}'::jsonb,
  device_type text,
  device_name text,
  operating_system text,
  browser text,
  user_agent text,
  screen_size text,
  session_id uuid
);

alter table public.user_activity_logs enable row level security;

create policy "authenticated users insert own activity"
on public.user_activity_logs for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "admins read all activity"
on public.user_activity_logs for select to authenticated
using ((select (auth.jwt() -> 'app_metadata' ->> 'app_role')) = 'admin');

revoke all on table public.user_activity_logs from anon;
grant insert, select on table public.user_activity_logs to authenticated;

create index user_activity_logs_occurred_at_idx on public.user_activity_logs (occurred_at desc);
create index user_activity_logs_username_idx on public.user_activity_logs (username, occurred_at desc);
create index user_activity_logs_action_type_idx on public.user_activity_logs (action_type, occurred_at desc);
