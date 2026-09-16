# Deploying Sanchara to Vercel

Sanchara is a Next.js 15 app backed by Supabase (auth + Postgres) and the
Anthropic API. Deployment target: Vercel, under the
**shivvyas0209@gmail.com** account (not any lunacommunity account).
Source: **github.com/shivvyas2/astra** (private repo, already created).

## 1. Push the repo to GitHub

The code lives in this working tree on branch `build/mvp`. Push it to the
existing private repo:

```bash
git remote add origin git@github.com:shivvyas2/astra.git   # if not already set
git push -u origin build/mvp
```

Merge to `main` (or deploy `build/mvp` directly) per your usual flow — Vercel
can build from either branch.

## 2. Install the Vercel CLI and log in

```bash
npm i -g vercel
vercel login
```

When prompted, **log in as `shivvyas0209@gmail.com`** — this is the personal
Vercel account this project deploys under, distinct from any
`@lunacommunity.ai` account you may also have access to. If the CLI opens a
browser flow, make sure the browser session/account you authorize is
`shivvyas0209@gmail.com`.

## 3. Link the project

From the project root:

```bash
cd /Users/shivvyas/astra
vercel link
```

Create a new project named `astra`, linked to the `shivvyas2/astra` GitHub
repo, under the `shivvyas0209@gmail.com` account/scope.

## 4. Add environment variables

Add each of the following for **both Production and Preview** environments.
The CLI will prompt for the value and the target environment(s) — select
Production and Preview (leave Development out unless you also want them in
`vercel dev`, since local dev already reads `.env.local`):

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add ANTHROPIC_API_KEY
```

Pull the values from your Supabase project settings (API section) and your
Anthropic Console API key. These are the same four variables documented in
`.env.example`.

Daily dosha alerts need five more (`CRON_SECRET` and the four `APNS_*`
variables) plus the `0004_alerts_push.sql` migration — see
[PUSH_ALERTS.md](./PUSH_ALERTS.md). Skip them and the rest of the app is
unaffected.

Sign in with Apple needs no environment variables, but the Apple provider has to
be enabled on the Supabase project — see
[APPLE_SIGN_IN.md](./APPLE_SIGN_IN.md).

Email sign-in sends a six-digit code rather than a magic link, which needs
`{{ .Token }}` in two Supabase email templates — see
[EMAIL_OTP.md](./EMAIL_OTP.md).

What a reading costs, and the caching and effort settings behind it, are in
[MODEL_COSTS.md](./MODEL_COSTS.md).

**Secrets discipline:** locally, secrets live only in `.env.local`, which is
gitignored (`.gitignore` excludes `.env*` and re-allows only
`.env.example`). In the cloud, secrets live only in Vercel's encrypted
environment variable store. At no point should any real key or service-role
secret be committed to the repo.

## 5. Update Supabase auth URLs

In the Supabase dashboard: **Authentication → URL Configuration**

- Set **Site URL** to your production Vercel domain, e.g.
  `https://astra.vercel.app`.
- Add to **Redirect URLs**:
  `https://<app>.vercel.app/auth/callback`

  Include both the production domain and, if you want preview deployments to
  authenticate correctly, any preview domain pattern you use
  (`https://astra-*.vercel.app/auth/callback`).

Do this for both Supabase projects in use (if you're running separate
staging/production Supabase projects) before smoke testing.

## 6. Deploy

```bash
vercel --prod
```

This builds and promotes the deployment to your production domain.

## 7. Smoke test on the live URL

Walk through the full flow on the deployed `https://<app>.vercel.app` URL:

1. **Signup** — create a new account.
2. **Intake** — submit a birth profile (date, time, location) and confirm a
   chart is computed/cached.
3. **Chat** — start a conversation, pick a tradition, confirm the response
   **streams** in.
4. **`/admin/login`** — log in as an admin and confirm the admin dashboard
   (users, conversations, read-only transcripts) loads correctly and that a
   non-admin account cannot reach it.

If any step fails, check the Vercel deployment logs (`vercel logs`) and
confirm all four env vars are present for the Production environment.

## Pre-deploy build gate

Before pushing/deploying, always run the full gate locally:

```bash
npm run test && npm run build
```

Both must succeed (all tests green, production build with no errors) before
you push to `main`/`build/mvp` or run `vercel --prod`.
