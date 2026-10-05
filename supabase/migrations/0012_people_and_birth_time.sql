-- Unknown birth times, and the other people in a user's life.
--
-- 1. birth_profiles.birth_time_known
--    Intake used to default silently to 12:00 when someone did not know their
--    birth time, and every reading then spoke confidently about an ascendant
--    and houses cast for noon. Now the user can say "I don't know", the chart
--    is cast for noon (or the rough part of day they pick) and flagged, and
--    the reading avoids everything that depends on the hour. The flag is also
--    stamped on the stored chart (chart.vedic.timeKnown = false), which is
--    what readings use; this column is what the admin contract reads
--    (`birth.timeKnown`) and what the intake form prefills from.
--
-- 2. people
--    Saved charts for a partner, a parent, a friend — the input to
--    compatibility (Guna Milan + synastry). Owner-only, like every table that
--    holds what a user tells us. Each row carries its own computed chart in
--    the same `{ vedic, western }` shape as birth_profiles.chart, written by
--    the same code (lib/data/birthProfile.ts computeChartPair).
--
-- Production may run without this migration for a while (main deploys on
-- every push). The app tolerates both pieces being absent: saving a profile
-- retries without the column, and /api/profiles reports the feature as not
-- available yet instead of failing. Applying this file switches it on.

alter table public.birth_profiles
  add column if not exists birth_time_known boolean not null default true;

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- What the user calls them: "Priya", "Mom", "My partner".
  label text not null check (char_length(label) between 1 and 60),
  relationship text not null default 'other' check (
    relationship in ('partner', 'spouse', 'crush', 'friend', 'parent', 'child', 'sibling', 'colleague', 'other')
  ),
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null default '' check (char_length(last_name) <= 80),
  birth_date date not null,
  -- Noon, or the middle of the rough part of day chosen, when not known.
  birth_time time not null,
  birth_time_known boolean not null default true,
  place_name text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  timezone text not null,
  chart jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.people enable row level security;
create index if not exists people_owner_created_idx on public.people (owner_id, created_at);

create policy "people select self" on public.people
  for select using (owner_id = auth.uid());
create policy "people insert self" on public.people
  for insert with check (owner_id = auth.uid());
create policy "people update self" on public.people
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "people delete self" on public.people
  for delete using (owner_id = auth.uid());

-- An anti-abuse ceiling, not a plan limit: no real person keeps 200 charts.
-- The API checks first and answers with a friendly 400; this is the backstop
-- for anything that writes around it.
create or replace function public.people_ceiling()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.people where owner_id = new.owner_id) >= 200 then
    raise exception 'people_ceiling: at most 200 saved people per account'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists people_ceiling on public.people;
create trigger people_ceiling
  before insert on public.people
  for each row execute function public.people_ceiling();
