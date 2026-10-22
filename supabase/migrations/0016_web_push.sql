-- Browser push subscriptions, one row per browser that turned notifications
-- on. The endpoint is the browser vendor's push URL and identifies the
-- browser; p256dh and auth are the keys the payload is encrypted to.
-- Owner-only, like device_tokens; the jobs send with the service role.
create table if not exists public.web_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  updated_at timestamptz not null default now()
);
alter table public.web_push_subscriptions enable row level security;
create index if not exists web_push_subscriptions_user on public.web_push_subscriptions (user_id);

create policy "web push self" on public.web_push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
