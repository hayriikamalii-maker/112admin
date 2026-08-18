alter table public.user_activity_logs
  add column if not exists ip_address text,
  add column if not exists country text,
  add column if not exists city text,
  add column if not exists datacenter text;

create index if not exists user_activity_logs_ip_address_idx
  on public.user_activity_logs (ip_address, occurred_at desc);
