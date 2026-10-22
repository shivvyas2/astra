-- The language a person's readings are written in: Ask, the morning and
-- evening readings, alerts, discoveries and the life map. "sanskrit" is
-- English with the Sanskrit terms. See lib/astrology/language.ts.
alter table public.birth_profiles
  add column if not exists reading_language text not null default 'english'
  check (reading_language in ('english', 'hindi', 'gujarati', 'sanskrit'));
