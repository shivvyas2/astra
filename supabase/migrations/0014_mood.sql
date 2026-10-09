-- Mood check-ins: one tap a day, 1 (rough) to 5 (great).
--
-- After enough days, Astrya compares how the person rated their days against
-- what the Moon was doing for them (lib/mood/patterns.ts): Chandra bala and
-- Tara bala, counted from their own natal Moon. Computed, no model, and shown
-- only once both sides of a comparison have enough days behind them.
--
-- Owner-only, like user_facts: no admin read policy. The app tolerates this
-- table being absent (42P01 / PGRST205): the check-in hides itself.

create table public.mood_checkins (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The person's own calendar date.
  day date not null,
  mood smallint not null check (mood between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.mood_checkins enable row level security;

create policy "mood select self" on public.mood_checkins
  for select using (user_id = auth.uid());
create policy "mood insert self" on public.mood_checkins
  for insert with check (user_id = auth.uid());
create policy "mood update self" on public.mood_checkins
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "mood delete self" on public.mood_checkins
  for delete using (user_id = auth.uid());
