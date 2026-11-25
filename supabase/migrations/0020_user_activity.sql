-- When each person last opened Astrya, so notifications stop after a week
-- without a visit and start again when they come back.
--
-- One timestamp per person and nothing else: not what they opened, nor how
-- often. Written only through touch_activity(), which can only ever write the
-- caller's own row with the server's own clock. Until this is applied, the
-- signals already stored are used (lib/alerts/audience.ts).

create table if not exists public.user_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.user_activity enable row level security;

drop policy if exists "activity select self" on public.user_activity;
create policy "activity select self" on public.user_activity
  for select using (user_id = auth.uid());

create or replace function public.touch_activity()
returns void language sql security definer set search_path = public as $$
  insert into public.user_activity (user_id, last_seen_at)
  select auth.uid(), now() where auth.uid() is not null
  on conflict (user_id) do update set last_seen_at = now();
$$;
revoke all on function public.touch_activity() from public, anon;
grant execute on function public.touch_activity() to authenticated;
