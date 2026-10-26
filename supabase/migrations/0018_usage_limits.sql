-- Daily limits on paid model calls, set from the admin.
--
-- Astrya charges nothing for readings, so these are what stop one account (or
-- a script making many) from spending the Anthropic balance. Three limits,
-- each null for "no limit":
--
--   readings_per_day   readings (normal and Deep) one user may ask for in their
--                      local day
--   usd_per_user_day   what one user's calls may cost in their local day; this
--                      also covers the timeline scan and explain routes
--   usd_all_users_day  what every user together may cost in the UTC day; when
--                      reached, readings pause for everyone until midnight UTC
--
-- usage_limits holds the defaults (one row). user_usage_limits overrides
-- readings_per_day and usd_per_user_day for one user; a null column there
-- falls back to the default. Admins are never limited.
--
-- Checked by lib/usage/limits.ts before every user-triggered model call and
-- edited only through the admin (service role). RLS is on with no policies,
-- so no user session can read or change them. Until this migration is
-- applied, nothing is limited, as before.

create table public.usage_limits (
  id boolean primary key default true check (id),
  readings_per_day integer check (readings_per_day >= 0),
  usd_per_user_day numeric(10, 2) check (usd_per_user_day >= 0),
  usd_all_users_day numeric(10, 2) check (usd_all_users_day >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.usage_limits enable row level security;

-- The heaviest real day so far was 14 readings and $0.75 for one user, and
-- $1.14 for everyone together (Oct 2026).
insert into public.usage_limits (id, readings_per_day, usd_per_user_day, usd_all_users_day)
values (true, 25, 1.00, 10.00);

create table public.user_usage_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  readings_per_day integer check (readings_per_day >= 0),
  usd_per_user_day numeric(10, 2) check (usd_per_user_day >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.user_usage_limits enable row level security;

-- Sum of model_usage cost since a moment, for one user or (uid null) for all.
-- Summed in the database so the all-users check is one row, not every call.
create or replace function public.model_cost_since(since timestamptz, uid uuid default null)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(cost_usd), 0) from public.model_usage
  where created_at >= since and (uid is null or user_id = uid);
$$;
revoke execute on function public.model_cost_since(timestamptz, uuid) from public, anon, authenticated;
