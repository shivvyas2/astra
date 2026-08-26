-- Twice-daily predictions, kept by date so a user can look back.
--
-- Written by the scheduled job with the service-role client; readable (and
-- markable-as-read) by their owner and nobody else.

create table public.daily_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The user's own local date, not UTC: "my reading for the 26th" has to mean
  -- their 26th.
  for_date date not null,
  slot text not null check (slot in ('morning', 'night')),
  tradition text not null default 'vedic',
  title text not null,
  body text not null,
  detail text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  -- One reading per slot per day. This is also what makes the job safe to run
  -- more often than expected, or twice by accident.
  unique (user_id, for_date, slot)
);
alter table public.daily_readings enable row level security;
create index on public.daily_readings (user_id, for_date desc);

create policy "daily readings self read" on public.daily_readings
  for select using (user_id = auth.uid());

create policy "daily readings self update" on public.daily_readings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
