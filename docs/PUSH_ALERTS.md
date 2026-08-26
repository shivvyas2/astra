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
the server's: anything before 14:00 local is that day's morning reading,
anything after is that night's (`lib/alerts/slots.ts`). The row is stored
against the user's local date with a unique index on
`(user_id, for_date, slot)`, which means the job is safe to run more often than
scheduled — a repeat run finds the slot already written and does nothing.

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
vercel env add CRON_SECRET          # any long random string
vercel env add APNS_KEY_ID          # the 10-character key ID
vercel env add APNS_TEAM_ID         # Z42YU5W6WY
vercel env add APNS_BUNDLE_ID       # com.shivvyas.astra
vercel env add APNS_PRIVATE_KEY     # full contents of the .p8 file
```

Without the APNs variables the job still runs and still writes alerts — the app
shows them in the bell inbox — it just sends no pushes.

### 4. Match the APNs environment on the app side

`mobile/project.yml` sets `aps-environment: development`, which mints **sandbox**
tokens. TestFlight and App Store builds need `production`. The app reports which
one it used when registering, and `lib/push/apns.ts` sends to the matching host,
so both can coexist.

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

Two fixed UTC runs land at 08:00 and 21:00 in IST, which is exactly the morning
and night slot. A user far from that timezone can have both runs land in the
same half of their local day, in which case they get one reading that day
rather than two. On a Vercel plan that allows sub-daily crons, changing the
schedule to `0 * * * *` makes every timezone exact, and costs nothing extra:
each hourly run writes only for users whose current slot is still missing.

Note that the **first** run for an existing user reports whatever standing natal
doshas they have, because nothing was on record before. After that, only changes
are reported.
