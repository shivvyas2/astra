-- Limits on sign-in codes, so nobody can flood someone's inbox or phone, run
-- up the SMS bill, or guess a code.
--
-- Counted in fixed windows per key. A key is a one-way hash made by the
-- server (lib/auth/throttle.ts), never an email, a phone number or an
-- address. Service role only: RLS is on with no policies. Until this is
-- applied, each server instance keeps its own count in memory instead.

create table if not exists public.auth_throttle (
  key text not null,
  seconds integer not null check (seconds between 1 and 172800),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, seconds, window_start)
);
create index if not exists auth_throttle_window_idx on public.auth_throttle (window_start);
alter table public.auth_throttle enable row level security;

-- Counts one attempt against every rule and answers how many seconds to wait:
-- 0 when all of them allow it. The three arrays line up, one rule each.
create or replace function public.auth_throttle_hit(p_keys text[], p_seconds integer[], p_limits integer[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  i integer;
  started timestamptz;
  n integer;
  wait integer := 0;
begin
  if coalesce(array_length(p_keys, 1), 0) <> coalesce(array_length(p_seconds, 1), 0)
     or coalesce(array_length(p_keys, 1), 0) <> coalesce(array_length(p_limits, 1), 0) then
    raise exception 'auth_throttle_hit: arrays must line up';
  end if;
  for i in 1 .. coalesce(array_length(p_keys, 1), 0) loop
    started := to_timestamp(floor(extract(epoch from now()) / p_seconds[i]) * p_seconds[i]);
    insert into public.auth_throttle as t (key, seconds, window_start, hits)
    values (p_keys[i], p_seconds[i], started, 1)
    on conflict (key, seconds, window_start) do update set hits = t.hits + 1
    returning t.hits into n;
    if n > p_limits[i] then
      wait := greatest(wait, ceil(extract(epoch from (started + make_interval(secs => p_seconds[i]) - now())))::integer, 1);
    end if;
  end loop;
  if random() < 0.02 then
    delete from public.auth_throttle where window_start < now() - interval '3 days';
  end if;
  return wait;
end;
$$;
revoke execute on function public.auth_throttle_hit(text[], integer[], integer[]) from public, anon, authenticated;
grant execute on function public.auth_throttle_hit(text[], integer[], integer[]) to service_role;
