-- Usage: one row per paid model call, so the admin can see what each user,
-- feature and model costs.
--
-- Written by the server after every Anthropic call (lib/usage/record.ts):
-- chat readings ('reading', 'deep_reading'), the memory pass ('memory'),
-- daily readings ('daily'), dosha alerts ('alert'), timeline extraction and
-- explanation ('extraction'). cost_usd is computed at write time from the
-- price table in lib/usage/prices.ts, so a later price change does not
-- rewrite history.
--
-- There is no quota: nothing reads this table to block a request. The admin
-- dashboard reads it to flag heavy use, and GET /api/usage reports a user's
-- own counts for the day.
--
-- Service role only. RLS is on with no policies at all, so no user session can
-- read or write it; admins read it through the server (lib/admin/stats.ts).
--
-- The app tolerates this table being absent (42P01 / PGRST205): writes are
-- skipped with one warning per server instance, and the admin shows zero cost.
-- Applying this migration is what switches tracking on.

create table public.model_usage (
  id uuid primary key default gen_random_uuid(),
  -- Kept when the account is deleted, without the link, so totals still add up.
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (
    kind in ('reading', 'deep_reading', 'memory', 'daily', 'alert', 'extraction', 'other')
  ),
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  -- Not a foreign key: a usage row outlives the conversation it paid for.
  conversation_id uuid,
  created_at timestamptz not null default now()
);

alter table public.model_usage enable row level security;

create index model_usage_user_created_idx on public.model_usage (user_id, created_at desc);
create index model_usage_created_idx on public.model_usage (created_at);
