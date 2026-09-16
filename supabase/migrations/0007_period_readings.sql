-- Plain-language meaning for each of a user's dasha periods.
--
-- One row per mahadasha, plus one row with lord = 'now' for the "where you
-- are" summary of the current mahadasha–antardasha pair. The 'now' row is
-- keyed on the antardasha start, so it goes stale by itself when the
-- sub-period changes.
--
-- events_hash records which pinned moments the text was written against. When
-- the moments inside a period change, the hash no longer matches and the
-- period is re-explained on next open.

create table public.period_readings (
  user_id uuid not null references auth.users(id) on delete cascade,
  lord text not null,
  period_start date not null,
  theme text not null check (char_length(theme) between 1 and 80),
  meaning text not null check (char_length(meaning) between 1 and 800),
  events_hash text not null,
  generated_at timestamptz not null default now(),
  primary key (user_id, lord, period_start)
);
alter table public.period_readings enable row level security;

-- Written by the explain route acting as the user, never by admin tooling.
create policy "period readings self" on public.period_readings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
