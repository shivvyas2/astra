alter table public.conversations drop constraint if exists conversations_tradition_check;
alter table public.conversations
  add constraint conversations_tradition_check check (tradition in ('vedic','western','numerology'));
