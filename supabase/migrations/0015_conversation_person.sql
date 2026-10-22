-- A reading can be about the user and one of their saved people: a match
-- read with both charts. The person stays with the conversation, so a
-- follow-up, or the reading reopened from history, still has both charts.
-- Deleting the person leaves the conversation as an ordinary reading.
alter table public.conversations
  add column if not exists person_id uuid references public.people(id) on delete set null;
