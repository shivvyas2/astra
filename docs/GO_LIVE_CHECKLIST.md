# Go-live checklist: daily readings, push, and the timeline

Everything below has to be done once per deployment, by whoever owns the
Vercel project, the Supabase project and the Apple developer account. None of
it is in git.

## Why this exists

The code writes two readings a day per user and sends a push when a dosha or
hard transit starts or ends. It runs twice a day on Vercel Cron, but the cron
route refuses every request until `CRON_SECRET` is set, no push goes out until
the four `APNS_*` variables are set, and the timeline tables exist only once
migrations 0006 and 0007 have been applied. Miss any of these and the app
still works; the scheduled features silently do nothing.

## 1. Vercel: set the secrets

Skip any that `vercel env ls production` already shows.

```bash
openssl rand -hex 32 | vercel env add CRON_SECRET production
vercel env add APNS_KEY_ID production        # 10 characters, from the APNs key page
vercel env add APNS_TEAM_ID production       # your Apple developer team id
vercel env add APNS_BUNDLE_ID production     # the app's bundle identifier
vercel env add APNS_PRIVATE_KEY production   # the whole .p8 file, BEGIN and END lines included
```

The APNs key is created in the Apple Developer portal under Certificates,
Identifiers and Profiles, then Keys, with the Apple Push Notifications service
enabled. It downloads once; keep the `.p8` somewhere safe.

Redeploy after adding variables so the running functions pick them up:

```bash
vercel redeploy --prod
```

## 2. Supabase: apply the timeline migrations

Run these in order, exactly as they are in the repo, either with
`supabase db push` or by pasting each into the SQL editor:

1. `supabase/migrations/0006_life_events.sql`
2. `supabase/migrations/0007_period_readings.sql`

Confirm with:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('life_events', 'life_event_scans', 'period_readings');
```

All three rows should come back.

## 3. Run the cron by hand and check

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/daily
```

Expect JSON with `predictions.written` at least 1 and, once a device is
registered under the matching APNs environment, `predictions.pushesSent` at
least 1. A `401` means the secret is not set or does not match.

Then in Supabase:

```sql
select for_date, slot, count(*) from daily_readings
group by 1, 2 order by 1 desc limit 6;
```

Today's date should appear.

## 4. Push environment on the phone

The app reports the APNs environment from its signing entitlement, so a debug
build from Xcode registers as `sandbox` and a TestFlight build as
`production`, and the server sends to the matching host. Nothing to configure.
If you ever ship a build with the wrong `aps-environment`, its tokens are
registered under the wrong host: delete those rows from `device_tokens` and
reopen the app once on each device.

## 5. Schedule

`vercel.json` runs the job at 02:30 and 15:30 UTC, which is 08:00 and 21:00 in
India. Each user gets a morning reading in the first run that falls before
14:00 on their own clock and a night reading in the first after it, so users
elsewhere still get both, just at less ideal hours. If the user base becomes
mixed, change the schedule to hourly; the job is idempotent and the model cost
is the same.
