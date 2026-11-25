-- For the admin dashboard: how many people open Astrya each day, and which
-- accounts keep using it for something it is not for.
--
-- daily_active is a number per UTC day and nothing else: no row says who.
-- It is counted by touch_activity(), the first time each person is seen that
-- day; admins are left out. chat_flags says which kind of message was turned
-- away and when, never what it said. Both are service-role only. Anyone in
-- crisis is never flagged (lib/guard).
--
-- Until this is applied nothing is counted or flagged, and chat works the same.

create table if not exists public.chat_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  kind text not null check (kind in ('off_topic', 'instructions', 'abuse')),
  created_at timestamptz not null default now()
);
create index if not exists chat_flags_user_idx on public.chat_flags (user_id, created_at desc);
create index if not exists chat_flags_created_idx on public.chat_flags (created_at);
alter table public.chat_flags enable row level security;

create table if not exists public.daily_active (
  day date primary key,
  users integer not null default 0
);
alter table public.daily_active enable row level security;

create or replace function public.touch_activity()
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  seen timestamptz;
begin
  if me is null then return; end if;
  select last_seen_at into seen from user_activity where user_id = me for update;
  insert into user_activity (user_id, last_seen_at) values (me, now())
  on conflict (user_id) do update set last_seen_at = now();
  if (seen is null or (seen at time zone 'utc')::date < today)
     and not exists (select 1 from admins where user_id = me) then
    insert into daily_active (day, users) values (today, 1)
    on conflict (day) do update set users = daily_active.users + 1;
  end if;
end;
$$;
revoke all on function public.touch_activity() from public, anon;
grant execute on function public.touch_activity() to authenticated;
