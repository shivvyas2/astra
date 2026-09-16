# Go-live checklist: morning readings, push, and the timeline

Everything below has to be done once, by the account owner, from a machine
logged into the right accounts. None of it is in git.

## Why this exists

As of 2026-09-16, production had written no daily readings since 2026-08-26
and had never sent a dosha alert. The code runs twice a day on Vercel Cron,
but the cron route refuses every request until `CRON_SECRET` is set, and no
push goes out until the four `APNS_*` variables are set. The timeline tables
from migrations 0006 and 0007 also did not exist in production.

## 1. Vercel: log in as the right account

The Vercel CLI on the dev machine was logged in as a different user, which is
why `vercel env` and `vercel link` failed. Fix that first:

```bash
vercel logout
vercel login            # choose shivvyas0209@gmail.com
cd /Users/shivvyas/astra
rm -rf .vercel && vercel link   # project: astra, scope: shivvyas-projects
vercel env ls production
```

## 2. Vercel: set the secrets

Skip any that `vercel env ls` already shows.

```bash
openssl rand -hex 32 | vercel env add CRON_SECRET production
vercel env add APNS_KEY_ID production        # 10 characters, from the APNs key page
vercel env add APNS_TEAM_ID production       # Z42YU5W6WY
vercel env add APNS_BUNDLE_ID production     # com.shivvyas.astra
vercel env add APNS_PRIVATE_KEY production   # paste the whole .p8 file, BEGIN and END lines included
```

The APNs key comes from developer.apple.com → Certificates, Identifiers &
Profiles → Keys → + → enable Apple Push Notifications service. It downloads
once; keep the `.p8` somewhere safe.

Redeploy after adding variables so the running functions pick them up:

```bash
vercel redeploy --prod
```

## 3. Supabase: apply the timeline migrations

In the Supabase dashboard → SQL editor, run these two files in order, exactly
as they are in the repo:

1. `supabase/migrations/0006_life_events.sql`
2. `supabase/migrations/0007_period_readings.sql`

Confirm with:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('life_events', 'life_event_scans', 'period_readings');
```

All three rows should come back.

## 4. Run the cron by hand and check

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://astra.shivvyas.com/api/cron/daily
```

Expect JSON with `predictions.written` at least 1 and, once a device is
registered under the matching APNs environment, `predictions.pushesSent`
at least 1. A `401` means the secret is not set or does not match.

Then in Supabase:

```sql
select for_date, slot, count(*) from daily_readings
group by 1, 2 order by 1 desc limit 6;
```

Today's date should appear.

## 5. Push environment on the phone

The app now reports the APNs environment from its signing entitlement, so a
debug build from Xcode registers as `sandbox` and a TestFlight build as
`production`, and the server sends to the matching host. Nothing to configure,
but note: rows in `device_tokens` registered before this fix may carry the
wrong environment. Delete them and reopen the app once on each device:

```sql
delete from device_tokens where updated_at < '2026-09-17';
```

## 6. Schedule

`vercel.json` runs the job at 02:30 and 15:30 UTC, which is 08:00 and 21:00
IST. Each user gets a morning reading in the first run that falls before
14:00 on their own clock and a night reading in the first after it, so users
outside India still get both, just at less ideal hours. If the user base
becomes mixed, change the schedule to hourly; the job is idempotent and the
model cost is the same.
