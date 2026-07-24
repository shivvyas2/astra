-- Astra schema + RLS. Run in Supabase SQL editor or via CLI.

create extension if not exists "pgcrypto";

-- Admins: presence in this table = admin. No self-service path (no insert policy).
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table public.birth_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  birth_date date not null,
  birth_time time not null,
  place_name text not null,
  lat double precision not null,
  lng double precision not null,
  timezone text not null,
  chart jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id)
);
alter table public.birth_profiles enable row level security;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tradition text not null check (tradition in ('vedic','western')),
  title text,
  created_at timestamptz not null default now()
);
alter table public.conversations enable row level security;
create index on public.conversations (user_id, created_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
create index on public.messages (conversation_id, created_at);

-- Auto-create a profile row when a new auth user is created.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- RLS: owner-only. Admin reads happen via the service-role client, which bypasses RLS.
create policy "profiles self" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "birth self" on public.birth_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "conv self" on public.conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "msg self" on public.messages
  for all using (
    exists (select 1 from public.conversations c
            where c.id = messages.conversation_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.conversations c
            where c.id = messages.conversation_id and c.user_id = auth.uid())
  );

-- admins table: readable only by admins; never writable via API (no insert/update/delete policy).
create policy "admins read self-or-admin" on public.admins
  for select using (user_id = auth.uid() or public.is_admin());
