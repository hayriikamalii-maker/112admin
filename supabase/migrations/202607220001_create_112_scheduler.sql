create extension if not exists pgcrypto;

create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  district text not null,
  station_type text not null check (station_type in ('A1', 'A2')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  full_name text not null,
  role text not null check (role in ('admin', 'user')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_ai_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  provider text not null check (provider in ('local', 'gemini', 'groq')),
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.user_station_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, station_id)
);

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  full_name text not null,
  title text not null check (title in ('Doktor', 'Paramedik', 'ATT', 'Sürücü', 'Sürücü ATT', 'Sürücü Paramedik')),
  cadre text not null check (cadre in ('Memur', '4D İşçi')),
  active boolean not null default true,
  manual_target numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_monthly_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  assignment_year integer not null,
  assignment_month integer not null check (assignment_month between 1 and 12),
  assignment_type text not null default 'Dış Görevlendirme',
  description text not null default '',
  created_at timestamptz not null default now(),
  unique (staff_id, assignment_year, assignment_month)
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  leave_type text not null check (leave_type in ('Yıllık izin', 'Rapor', 'Mazeret', 'Eğitim', 'Diğer')),
  start_date date not null,
  end_date date not null,
  last_duty_date date,
  allow_overtime boolean not null default false,
  description text not null default '',
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.public_holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null,
  name text not null,
  manual boolean not null default true,
  created_at timestamptz not null default now(),
  unique (holiday_date, name)
);

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  schedule_year integer not null,
  schedule_month integer not null check (schedule_month between 1 and 12),
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (station_id, schedule_year, schedule_month)
);

create table if not exists public.schedule_days (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  duty_date date not null,
  notes text not null default '',
  unique (schedule_id, duty_date)
);

create table if not exists public.schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  schedule_day_id uuid not null references public.schedule_days(id) on delete cascade,
  role text not null check (role in ('doctor', 'chief', 'ysp', 'driver')),
  shift text not null check (shift in ('day', 'night', 'full')),
  staff_id uuid references public.staff(id) on delete set null,
  manual_override boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_day_id, role, shift)
);

create table if not exists public.schedule_change_logs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  duty_date date not null,
  field_name text not null,
  previous_staff_id uuid references public.staff(id) on delete set null,
  next_staff_id uuid references public.staff(id) on delete set null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create table if not exists public.schedule_rule_violations (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  duty_date date,
  staff_id uuid references public.staff(id) on delete set null,
  severity text not null check (severity in ('warning', 'critical')),
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_api_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique check (provider in ('gemini', 'groq')),
  api_key_ciphertext text not null,
  active boolean not null default true,
  updated_by uuid references public.app_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.stations enable row level security;
alter table public.app_users enable row level security;
alter table public.user_ai_providers enable row level security;
alter table public.user_station_access enable row level security;
alter table public.staff enable row level security;
alter table public.staff_monthly_assignments enable row level security;
alter table public.leave_requests enable row level security;
alter table public.public_holidays enable row level security;
alter table public.schedules enable row level security;
alter table public.schedule_days enable row level security;
alter table public.schedule_assignments enable row level security;
alter table public.schedule_change_logs enable row level security;
alter table public.schedule_rule_violations enable row level security;
alter table public.app_settings enable row level security;
alter table public.ai_api_settings enable row level security;

create policy "authenticated users can read stations" on public.stations for select to authenticated using (true);
create policy "authenticated users can manage stations" on public.stations for all to authenticated using (true) with check (true);

create policy "authenticated users can read app users" on public.app_users for select to authenticated using (true);
create policy "authenticated users can manage app users" on public.app_users for all to authenticated using (true) with check (true);

create policy "authenticated users can read user ai providers" on public.user_ai_providers for select to authenticated using (true);
create policy "authenticated users can manage user ai providers" on public.user_ai_providers for all to authenticated using (true) with check (true);

create policy "authenticated users can read station access" on public.user_station_access for select to authenticated using (true);
create policy "authenticated users can manage station access" on public.user_station_access for all to authenticated using (true) with check (true);

create policy "authenticated users can read staff" on public.staff for select to authenticated using (true);
create policy "authenticated users can manage staff" on public.staff for all to authenticated using (true) with check (true);

create policy "authenticated users can read monthly assignments" on public.staff_monthly_assignments for select to authenticated using (true);
create policy "authenticated users can manage monthly assignments" on public.staff_monthly_assignments for all to authenticated using (true) with check (true);

create policy "authenticated users can read leaves" on public.leave_requests for select to authenticated using (true);
create policy "authenticated users can manage leaves" on public.leave_requests for all to authenticated using (true) with check (true);

create policy "authenticated users can read holidays" on public.public_holidays for select to authenticated using (true);
create policy "authenticated users can manage holidays" on public.public_holidays for all to authenticated using (true) with check (true);

create policy "authenticated users can read schedules" on public.schedules for select to authenticated using (true);
create policy "authenticated users can manage schedules" on public.schedules for all to authenticated using (true) with check (true);

create policy "authenticated users can read schedule days" on public.schedule_days for select to authenticated using (true);
create policy "authenticated users can manage schedule days" on public.schedule_days for all to authenticated using (true) with check (true);

create policy "authenticated users can read assignments" on public.schedule_assignments for select to authenticated using (true);
create policy "authenticated users can manage assignments" on public.schedule_assignments for all to authenticated using (true) with check (true);

create policy "authenticated users can read change logs" on public.schedule_change_logs for select to authenticated using (true);
create policy "authenticated users can insert change logs" on public.schedule_change_logs for insert to authenticated with check (true);

create policy "authenticated users can read violations" on public.schedule_rule_violations for select to authenticated using (true);
create policy "authenticated users can manage violations" on public.schedule_rule_violations for all to authenticated using (true) with check (true);

create policy "authenticated users can read settings" on public.app_settings for select to authenticated using (true);
create policy "authenticated users can manage settings" on public.app_settings for all to authenticated using (true) with check (true);

create policy "authenticated users can read ai settings" on public.ai_api_settings for select to authenticated using (true);
create policy "authenticated users can manage ai settings" on public.ai_api_settings for all to authenticated using (true) with check (true);

create index if not exists user_ai_providers_user_idx on public.user_ai_providers(user_id);
create index if not exists user_station_access_user_idx on public.user_station_access(user_id);
create index if not exists user_station_access_station_idx on public.user_station_access(station_id);
create index if not exists staff_station_id_idx on public.staff(station_id);
create index if not exists staff_monthly_assignments_period_idx on public.staff_monthly_assignments(assignment_year, assignment_month);
create index if not exists leave_requests_staff_dates_idx on public.leave_requests(staff_id, start_date, end_date);
create index if not exists schedules_station_period_idx on public.schedules(station_id, schedule_year, schedule_month);
create index if not exists schedule_days_schedule_date_idx on public.schedule_days(schedule_id, duty_date);
create index if not exists schedule_assignments_day_idx on public.schedule_assignments(schedule_day_id);
create index if not exists change_logs_schedule_idx on public.schedule_change_logs(schedule_id, changed_at desc);
