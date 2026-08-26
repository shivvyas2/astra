-- Dosha alerts + APNs device registration.
--
-- The daily job (`/api/cron/alerts`) writes both tables with the service-role
-- client, which bypasses RLS. The policies below exist so the app can read its
-- own alerts and manage its own device tokens directly.

create table public.device_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'ios' check (platform in ('ios')),
  -- Which APNs host to send to. A token minted by a development build is only
  -- valid against the sandbox, and vice versa.
  environment text not null default 'production' check (environment in ('sandbox', 'production')),
  updated_at timestamptz not null default now()
);
alter table public.device_tokens enable row level security;
create index on public.device_tokens (user_id);

create policy "device tokens self" on public.device_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The current state of every affliction the engine has seen for a user.
-- A row is open (`ended_on is null`) while the condition holds; the daily diff
-- against this table is what makes a notification mean "this changed today".
create table public.transit_conditions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  signature text not null,
  label text not null,
  severity text not null check (severity in ('info', 'caution', 'warning')),
  scope text not null check (scope in ('natal', 'transit')),
  detail text not null,
  started_on date not null default (now() at time zone 'utc')::date,
  ended_on date
);
alter table public.transit_conditions enable row level security;
create unique index transit_conditions_open_signature
  on public.transit_conditions (user_id, signature) where ended_on is null;
create index on public.transit_conditions (user_id, ended_on);

create policy "conditions self read" on public.transit_conditions
  for select using (user_id = auth.uid());

-- One notification: what changed, written for the user.
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  severity text not null check (severity in ('info', 'caution', 'warning')),
  kinds text[] not null default '{}',
  title text not null,
  body text not null,
  detail text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
alter table public.alerts enable row level security;
create index on public.alerts (user_id, created_at desc);

create policy "alerts self read" on public.alerts
  for select using (user_id = auth.uid());

-- Marking an alert read is the only write the app makes.
create policy "alerts self update" on public.alerts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
