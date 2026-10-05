# Daily readings, dosha alerts, and push notifications

Two things are pushed to a user, both written from their own chart against
today's sky:

1. **A reading, morning and night** — what today holds, and how it closed. Kept
   by date, so the app shows an archive rather than a notification that
   vanishes.
2. **A dosha alert, only when something changes** — a dosha or difficult
   transit that starts, or one that ends. A condition that merely continues is
   never re-notified, so a standing Sade Sati does not become a daily nag.

Both run from one endpoint, `/api/cron/daily`, fired twice a day.

## The twice-daily reading

`lib/alerts/predictions.ts`. Each user is handled on **their own clock**, not
the server's. The clock is the phone's own timezone, reported when it
registers for pushes (`device_tokens.timezone`, migration 0013), falling back
to the birthplace timezone on the profile, then UTC (`lib/alerts/zones.ts`).
Someone born in Ahmedabad and living in New York gets New York hours.

The job runs every hour. The morning reading is written by the first run that
lands between 7:00 and 11:59 local, the night one by the first run between
20:00 and 23:59 (`lib/alerts/slots.ts`), so in practice they arrive at about
7 and 20 wherever the person is. Between the windows nothing is due. The row
is stored against the user's local date with a unique index on
`(user_id, for_date, slot)`, which means a repeat run finds the slot already
written and does nothing.

The reading is composed by Sonnet 5 at low effort, from the same cached chart
prompt the chat uses, plus today's transits and any non-`info` conditions the
dosha engine found — so the reading and the alerts never contradict each other.
Morning looks forward; night reflects on the day and opens tomorrow. If the
model call fails, a plain fallback is stored so the slot is never empty.

Because both runs use the same cached chart block, a user's two readings in one
hour bill the second one's prompt at a tenth of the rate.

## How the dosha alerts work

1. **`/api/cron/daily`** runs twice a day (`vercel.json`, 02:30 and 15:30 UTC —
   08:00 and 21:00 IST). Vercel authenticates it with
   `Authorization: Bearer $CRON_SECRET`; with no secret configured the route
   refuses everything. (`/api/cron/alerts` still exists for running just the
   dosha sweep by hand.)
2. For each user with a computed chart, `lib/alerts/run.ts` recomputes today's
   sky at their birthplace with the Swiss Ephemeris and calls
   `detectConditions()`.
3. **`lib/astrology/doshas.ts`** decides — in code, deterministically — which
   afflictions hold. Natal: Mangal, Kaal Sarp, Grahan, Kemadruma, Pitru,
   Shrapit. Transit: Sade Sati (with phase), Shani Dhaiya, Kantaka Shani, a node
   over the natal Moon or ascendant, Mars over the natal Moon, Ashtama Surya,
   Jupiter in 6/8/12, Guru Chandal, and retrogrades on a sensitive sign.
   Each condition carries a `signature` that folds in the phase and sign, so
   Saturn moving on reads as a change rather than the same condition continuing.
4. The run diffs those signatures against the open rows in
   `transit_conditions`, closing what ended and opening what started.
5. Only `caution` and `warning` changes are worth a lock screen; `info`
   conditions are recorded silently.
6. **Claude** (`lib/alerts/compose.ts`, Opus) writes the copy — title, one-line
   body, and a short markdown reading with a remedy — from the facts it is
   handed. It never decides whether a dosha exists; if the call fails, a
   deterministic fallback still names the condition.
7. The alert is stored in `alerts` (visible in the app's bell inbox) and pushed
   to every registered device via APNs (`lib/push/apns.ts`).

## One-time setup

### 1. Run the migration

Apply **both** migrations in the Supabase SQL editor:

- `supabase/migrations/0004_alerts_push.sql` — `device_tokens`,
  `transit_conditions`, `alerts`.
- `supabase/migrations/0005_daily_readings.sql` — `daily_readings`, the
  by-date archive.

Every table is owner-only under RLS; the jobs write with the service-role
client.

### 2. Create an APNs key

developer.apple.com → Certificates, Identifiers & Profiles → **Keys** → **+**,
enable **Apple Push Notifications service (APNs)**, download the `.p8` (it can
only be downloaded once).

### 3. Set the environment variables

```bash
openssl rand -hex 32 | tr -d '\n' | vercel env add CRON_SECRET production
printf 'XXXXXXXXXX' | vercel env add APNS_KEY_ID production        # the 10-character key ID
printf 'Z42YU5W6WY' | vercel env add APNS_TEAM_ID production
printf 'com.shivvyas.astra' | vercel env add APNS_BUNDLE_ID production
vercel env add APNS_PRIVATE_KEY production < AuthKey_XXXXXXXXXX.p8
```

`CRON_SECRET` is sent as an HTTP header, so it must not end in a newline:
Vercel refuses to build a deployment whose secret has leading or trailing
whitespace. Piping through `tr -d '\n'` or using `printf` avoids that.

Without the APNs variables the job still runs and still writes alerts — the app
shows them in the bell inbox — it just sends no pushes.

### 4. Match the APNs environment on the app side

`mobile/project.yml` sets `aps-environment: development`, which mints **sandbox**
tokens. TestFlight and App Store builds need `production`. The app reports which
one it used when registering, and `lib/push/apns.ts` sends to the matching host,
so both can coexist.

### 5. Run it every hour

Vercel's Hobby plan fires a cron at most once a day, and 7am in Mumbai is
9:30pm in New York, so the hourly beat comes from GitHub Actions:
`.github/workflows/cron.yml` calls `/api/cron/daily` on the custom domain at
the top of every hour (the `*.vercel.app` domains sit behind Vercel's login
wall; the custom domain does not). It needs one repository secret with the
same value as the Vercel variable. Set both from one value so they cannot
drift:

```bash
S=$(openssl rand -hex 32)
vercel env rm CRON_SECRET production -y
printf '%s' "$S" | vercel env add CRON_SECRET production
printf '%s' "$S" | gh secret set CRON_SECRET --repo shivvyas2/astra
unset S
```

Then redeploy. "Run workflow" on the Actions tab fires it by hand. The two
crons in `vercel.json` (02:30 and 15:30 UTC) stay as a backstop: on their own
they still land one morning and one night reading in both India and New York.

## Discoveries

`lib/alerts/discoveries.ts`. On about three days in seven, at some hour
between 10:00 and 18:59 local, a person gets one small true thing about
themselves: a placement in their chart (an exalted planet, a house lord's
position, the running mahadasha), a number in their birth date (personal year
and month, the Lo Shu grid), a sign change or station coming up in the sky
read against their chart, or a prediction a past reading made whose window is
open now, with a gentle "did it happen?". Which days and which hour come from
a hash of the user and the local date, so every hourly run agrees and nothing
is sent twice; the row is written to `alerts` with severity `info` and
`kinds` starting with `discovery`, so it sits in the bell inbox like any other
alert. Copy is written by Haiku 4.5 from the one fact, for a fraction of a
cent, with a plain fallback if the call fails.

## Testing the job by hand

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://astra.shivvyas.com/api/cron/daily
```

It answers with a summary of both halves:

```json
{
  "predictions": { "considered": 1, "written": 1, "pushesSent": 1, "skipped": 0, "failures": 0 },
  "alerts": { "processed": 1, "alerted": 0, "pushesSent": 0, "failures": 0, "pushConfigured": true }
}
```

`skipped` counts users whose current slot was already written — the normal
result for a second run in the same half of a user's day.

### Timezones and how often the job runs

Every part of the job is decided per user, on the user's own clock, so the
hourly run is cheap: most hours, for most people, nothing is due. The
readings have the delivery windows above; the dosha sweep diffs the sky only
between 8:00 and 21:59 local, so a condition that begins overnight is found
and pushed at 8am rather than 3am; discoveries have their own hashed hour.
If the hourly workflow is ever off, the two Vercel crons alone still give
both India and New York a morning and a night reading, just at fixed times
(08:00 and 21:00 IST; 22:30 and 11:30 in New York).

Note that the **first** run for an existing user reports whatever standing natal
doshas they have, because nothing was on record before. After that, only changes
are reported.
