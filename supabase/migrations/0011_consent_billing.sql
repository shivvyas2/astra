-- AI consent and the Astrya Plus subscription.
--
-- ai_consents: one row per user saying which version of the "what we send to
-- Anthropic" notice they agreed to, when, and on which platform. Apple has
-- required explicit consent before personal data goes to a third-party AI
-- since November 2025; this is the server's record of it. The user writes
-- their own row (agree) and deletes it (withdraw), so it is owner-only.
-- The chat route refuses a reading (403 consent_required) while no row for
-- the current version exists — but only once this table exists. Until the
-- migration is applied the app records consent on the device alone and the
-- route fails open, exactly as it behaved before.
--
-- subscriptions: the App Store subscription state, one row per user. Written
-- only by the server with the service role, after it has verified the signed
-- transaction against Apple's root certificate (POST /api/billing/apple) or
-- an App Store Server Notification (POST /api/billing/apple/notifications).
-- The user can read their own row; nothing else. Plus gates nothing today,
-- and getPlan() reads a missing table as "free".

create table public.ai_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- The notice's version string (lib/billing/consent.ts CONSENT_VERSION).
  -- Bumping it there asks everyone again.
  version text not null check (char_length(version) between 1 and 40),
  accepted_at timestamptz not null default now(),
  platform text not null check (platform in ('ios', 'web'))
);
alter table public.ai_consents enable row level security;

create policy "ai consents select self" on public.ai_consents
  for select using (user_id = auth.uid());
create policy "ai consents insert self" on public.ai_consents
  for insert with check (user_id = auth.uid());
create policy "ai consents update self" on public.ai_consents
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Withdrawing consent deletes the row; the app then asks again.
create policy "ai consents delete self" on public.ai_consents
  for delete using (user_id = auth.uid());

create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'plus')),
  status text not null check (status in ('active', 'grace', 'expired', 'revoked')),
  product_id text,
  -- Apple's id for the whole subscription across renewals. Unique so one
  -- Apple purchase cannot be attached to two accounts.
  original_transaction_id text unique,
  expires_at timestamptz,
  environment text check (environment in ('Sandbox', 'Production')),
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;

-- Read-only for the owner. No insert/update/delete policies: only the
-- service role (which bypasses RLS) writes here.
create policy "subscriptions select self" on public.subscriptions
  for select using (user_id = auth.uid());
