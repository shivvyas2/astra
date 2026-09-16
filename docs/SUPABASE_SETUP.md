# Supabase setup for Sanchara

1. Create a project at https://supabase.com/dashboard (free tier is fine).
2. Project Settings → API. Copy into `.env.local`:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (secret — server only)
3. Authentication → Providers: enable **Email** (password) and **Email → Magic Link**.
4. SQL Editor → paste `supabase/migrations/0001_init.sql` → Run.
5. To make yourself an admin, sign up in the app first, then run in SQL editor:
   `insert into public.admins (user_id) values ('<your auth user id>');`
   (Find your id in Authentication → Users.)
