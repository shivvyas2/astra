-- The moments a user pins onto their dasha timeline.
--
-- This is the one table in the schema holding what the user tells us about
-- their own life rather than what the ephemeris computes, so it is owner-only
-- in both directions: no admin read policy, no service-role writes outside the
-- extraction job acting for that same user.

create table public.life_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Day precision. People remember "March 2021", not an hour, and a false
  -- hour would imply the chart says more than it can.
  occurred_on date not null,
  -- True when the user only knew the month or the year. The UI reads this to
  -- draw a soft marker instead of a hard one.
  precision text not null default 'day' check (precision in ('day', 'month', 'year')),
  title text not null check (char_length(title) between 1 and 120),
  note text check (char_length(note) <= 2000),
  -- 'manual' — typed by the user. 'extracted' — proposed from their own chat
  -- history and then confirmed. Kept so the UI can show provenance and so a
  -- bad extraction run can be undone without touching hand-entered events.
  source text not null default 'manual' check (source in ('manual', 'extracted')),
  created_at timestamptz not null default now()
);
alter table public.life_events enable row level security;
create index on public.life_events (user_id, occurred_on);

create policy "life events self" on public.life_events
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Remembers that we already mined this user's conversations, so the "we found
-- some moments" prompt appears once rather than on every open. Cleared by
-- deleting the row if extraction ever needs to run again.
create table public.life_event_scans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  -- How many candidates the scan proposed, for support and for deciding
  -- whether a re-scan is worth offering after the user has chatted more.
  found_count integer not null default 0
);
alter table public.life_event_scans enable row level security;

create policy "life event scans self" on public.life_event_scans
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
