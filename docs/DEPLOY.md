# Deploying Sanchara to Vercel

Sanchara is a Next.js 15 app backed by Supabase (Auth, Postgres, Storage) and
the Anthropic API. The web app and the API deploy to Vercel from the `main`
branch through Vercel's Git integration; there is no deploy step in GitHub
Actions. The iOS app is built separately, see the README.

## 1. Create the Vercel project

Import the GitHub repository into Vercel, or link it from the CLI:

```bash
npm i -g vercel
vercel login
vercel link
```

Framework preset: Next.js. Root directory: the repository root. Leave the
build command as `next build`; the build needs no secrets, because every
environment variable is read at request time through `lib/env.ts`.

## 2. Add environment variables

Add each of the following for **both Production and Preview**. Leave
Development out unless you use `vercel dev`; local development reads
`.env.local`.

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add ANTHROPIC_API_KEY
```

The first two come from the Supabase project's API settings and are safe in
clients. The service-role key and the Anthropic key are server-only and must
never be pasted anywhere but Vercel's environment store.

Daily readings and dosha alerts need five more (`CRON_SECRET` and the four
`APNS_*` variables). Without them the app works, the cron route refuses every
request, and no push is sent. See [PUSH_ALERTS.md](./PUSH_ALERTS.md) and the
[go-live checklist](./GO_LIVE_CHECKLIST.md).

Sign in with Apple needs no environment variables, but the Apple provider has
to be enabled on the Supabase project: [APPLE_SIGN_IN.md](./APPLE_SIGN_IN.md).

Email sign-in sends a six-digit code rather than a magic link, which needs
`{{ .Token }}` in two Supabase email templates: [EMAIL_OTP.md](./EMAIL_OTP.md).

What a reading costs, and the caching and effort settings behind it, are in
[MODEL_COSTS.md](./MODEL_COSTS.md).

**Secrets discipline.** Locally, secrets live only in `.env.local`, which is
gitignored (`.gitignore` excludes `.env*` and re-allows only `.env.example`).
In the cloud they live only in Vercel's encrypted environment store. No real
key is ever committed, and CI scans the full history on every pull request.

## 3. Update Supabase auth URLs

In the Supabase dashboard, under Authentication and then URL Configuration:

- Set **Site URL** to the production domain.
- Add `https://<your-domain>/auth/callback` to **Redirect URLs**. Add the
  preview pattern too (`https://<project>-*.vercel.app/auth/callback`) if
  preview deployments should be able to sign in.

## 4. Apply the migrations

Every file under `supabase/migrations/`, lowest number first, before traffic
reaches code that needs the table:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

## 5. Deploy

Push to `main`, or from the CLI:

```bash
vercel --prod
```

## 6. Smoke test on the live URL

1. **Sign up** with an email and the six-digit code.
2. **Intake**: submit a birth profile and confirm the chart is computed.
3. **Chat**: start a conversation, pick a tradition, confirm the reply streams.
4. **Kundli**: download the PDF.
5. **`/admin/login`**: confirm an admin can read transcripts and a non-admin
   account cannot reach the area.

If any step fails, check the Vercel deployment logs and confirm the four
required variables are present for the Production environment.

## Before every deploy

```bash
npm test && npx tsc --noEmit && npm run build
```

All three must pass. CI runs the same gate on every push and pull request.
