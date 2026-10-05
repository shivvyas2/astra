-- Memory, part two: what was discussed, what was predicted, and how sure we
-- are of each fact.
--
-- 0008 taught Astrya the standing facts of someone's life. This adds the
-- other two things a good astrologer remembers between sittings:
--
--   conversation_memories  a short rolling summary of each conversation
--                          (what was asked, what was concluded) and its
--                          topics, so a reading next month can build on it.
--   predictions            each dated prediction a reading committed to, so
--                          later readings stay consistent with it (or revise
--                          it openly) and the user can say whether it happened.
--
-- Both are written either by the server's Haiku pass after a reading or, on
-- an iPhone with Apple Intelligence, by the on-device model through
-- POST /api/memory/ingest — always with the user's own session.
--
-- Like user_facts these hold what the user said and what we told them, so they
-- are owner-only: no admin read policy. The user sees both lists under "What
-- Astrya knows" and can delete any row.
--
-- The app tolerates every part of this migration being absent (42P01 /
-- PGRST205 for the tables, 42703 / PGRST204 for the new user_facts columns):
-- readings run as they did before and the lists show empty. Apply 0006, 0007
-- and 0008 first; this depends on 0008's user_facts.

-- How a fact was learned, and when the user last confirmed it.
alter table public.user_facts
  add column confidence text not null default 'stated'
    check (confidence in ('stated', 'inferred')),
  add column last_confirmed_at timestamptz,
  add column source text not null default 'chat'
    check (source in ('chat', 'on_device', 'intake', 'manual'));

-- One row per conversation. Deleted with the conversation; the user can also
-- delete the summary alone and keep the transcript.
create table public.conversation_memories (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  summary text not null check (char_length(summary) between 3 and 600),
  -- From a fixed list (lib/memory/topics.ts) so retrieval can match a new
  -- question to the houses it concerns without a model call.
  topics text[] not null default '{}' check (cardinality(topics) <= 6),
  last_message_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.conversation_memories enable row level security;
create index on public.conversation_memories (user_id, last_message_at desc);

create policy "conversation memories select self" on public.conversation_memories
  for select using (user_id = auth.uid());
-- Only for a conversation the caller owns, on top of owning the row.
create policy "conversation memories insert self" on public.conversation_memories
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid())
  );
create policy "conversation memories update self" on public.conversation_memories
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "conversation memories delete self" on public.conversation_memories
  for delete using (user_id = auth.uid());

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Kept when the conversation is deleted: it was said, and it can still be
  -- checked. The user deletes the prediction itself to forget it.
  conversation_id uuid references public.conversations(id) on delete set null,
  topic text not null check (
    topic in ('career', 'relationships', 'money', 'health', 'home', 'family', 'children', 'travel', 'education', 'general')
  ),
  -- One plain sentence: "A job offer from outside your current employer".
  claim text not null check (char_length(claim) between 8 and 280),
  window_start date not null,
  window_end date not null,
  confidence text not null check (confidence in ('likely', 'possible', 'unlikely')),
  status text not null default 'open' check (status in ('open', 'happened', 'didnt', 'unsure')),
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  check (window_end >= window_start)
);
alter table public.predictions enable row level security;
create index on public.predictions (user_id, status, window_end);

create policy "predictions select self" on public.predictions
  for select using (user_id = auth.uid());
create policy "predictions insert self" on public.predictions
  for insert with check (
    user_id = auth.uid()
    and (
      conversation_id is null
      or exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid())
    )
  );
create policy "predictions update self" on public.predictions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "predictions delete self" on public.predictions
  for delete using (user_id = auth.uid());
