-- Standing facts a user has told Astrya about their own life.
--
-- "I'm a nurse in Pune", "engaged since June", "worried about my father's
-- health". A cheap pass after each reading proposes them from the user's own
-- words; every later reading is handed them so a prediction can be tied to the
-- job, the relationship, or the plan the person actually has.
--
-- Like life_events this holds what the user tells us rather than what the
-- ephemeris computes, so it is owner-only: no admin read policy, and every
-- write is made with the user's own session. The user sees the whole list in
-- "What Astrya knows" and can delete any row, or all of them.
--
-- The app tolerates this table being absent (42P01 / PGRST205): readings run
-- exactly as before and the list shows empty. Applying this migration is what
-- switches the feature on.

create table public.user_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- One short sentence, written neutrally ("Works as a nurse in Pune").
  fact text not null check (char_length(fact) between 3 and 280),
  category text not null check (
    category in ('work', 'relationships', 'family', 'health', 'money', 'home', 'goals', 'worries', 'other')
  ),
  -- The conversation it was learned in. Kept when that conversation is
  -- deleted: the user said it, and it stays until they delete the fact itself.
  source_conversation_id uuid references public.conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Set by the app when a fact is reworded ("engaged" becomes "married").
  updated_at timestamptz not null default now()
);
alter table public.user_facts enable row level security;
create index on public.user_facts (user_id, updated_at desc);

create policy "user facts select self" on public.user_facts
  for select using (user_id = auth.uid());
create policy "user facts insert self" on public.user_facts
  for insert with check (user_id = auth.uid());
create policy "user facts update self" on public.user_facts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "user facts delete self" on public.user_facts
  for delete using (user_id = auth.uid());
