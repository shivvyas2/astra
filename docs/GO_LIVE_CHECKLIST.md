# Go-live checklist: daily readings, push, and the timeline

Everything below has to be done once per deployment, by whoever owns the
Vercel project, the Supabase project and the Apple developer account. None of
it is in git.

## Why this exists

The code writes two readings a day per user and sends a push when a dosha or
hard transit starts or ends. It runs twice a day on Vercel Cron, but the cron
route refuses every request until `CRON_SECRET` is set, no push goes out until
the four `APNS_*` variables are set, and the timeline and memory tables exist only
once migrations 0006 to 0009 have been applied. Miss any of these and the app
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

## 2. Supabase: apply the timeline and memory migrations

Run these in order, exactly as they are in the repo, either with
`supabase db push` or by pasting each into the SQL editor:

1. `supabase/migrations/0006_life_events.sql`
2. `supabase/migrations/0007_period_readings.sql`
3. `supabase/migrations/0008_user_facts.sql` (what Astrya remembers from
   chats; until it exists, readings run as before and nothing is remembered)
4. `supabase/migrations/0009_memory.sql` (conversation summaries, the
   predictions ledger, and confidence/source columns on `user_facts`; needs
   0008 first. Until it exists, facts still work and summaries and
   predictions are simply not kept)

Confirm with:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('life_events', 'life_event_scans', 'period_readings', 'user_facts',
                     'conversation_memories', 'predictions');

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'user_facts'
  and column_name in ('confidence', 'last_confirmed_at', 'source');
```

Six rows from the first query and three from the second. After a reading or
two, `select count(*) from conversation_memories` should be above zero, and
the Vercel logs should show one `memory usage model=claude-haiku-4-5` line per
web reading (none for readings from an iPhone with Apple Intelligence, which
remembers on-device).

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

## 6. AI consent and Astrya Plus (migration 0011, App Store Connect)

### Supabase

Apply `supabase/migrations/0011_consent_billing.sql` (after whatever 0010 is
in the repo). It creates `ai_consents` (owner read/write/delete) and
`subscriptions` (owner read only; written by the server with the service
role). Until it exists, consent is recorded only on each device (and in a
cookie on the web), the chat route does not enforce it, and everyone reads as
"free". Confirm:

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('ai_consents', 'subscriptions');
```

Two rows. `SUPABASE_SERVICE_ROLE_KEY` must be set in Vercel (it already is for
the admin and cron). Note that existing users see the consent screen once on
their next visit; that is intended.

### App Store Connect

1. **Subscriptions → create a subscription group named "Astrya Plus"**, then two
   auto-renewable subscriptions in it, both at level 1:
   - `com.shivvyas.astra.plus.monthly`, 1 month, $6.99 (price tier for USD; let
     App Store Connect fill other storefronts)
   - `com.shivvyas.astra.plus.yearly`, 1 year, $49.99
   No free trial, no introductory offer, no weekly plan. Add a display name and
   description to each and to the group, and a review screenshot of the paywall
   (You → Astrya Plus).
2. **Plus is support plus cosmetic extras** (decided 2026-10-09). It never
   gates or caps readings. It adds three alternate app icons (lime, violet,
   bone; You → App icon) and the badge. The benefit lines live in
   `lib/billing/copy.ts` (`PLUS_BENEFITS`) and
   `mobile/Sanchara/Sources/Features/Billing/PlusCopy.swift`; every line must
   be true when it ships. In the review notes, say Plus is reached from
   You → Astrya Plus and that the icons are under You → App icon.
3. **App Information → App Store Server Notifications**: set both the Production
   and the Sandbox URL to `https://astra.shivvyas.com/api/billing/apple/notifications`,
   Version 2. Use "Request a Test Notification" and check the Vercel logs for
   `billing notification TEST`.
4. **App Privacy (nutrition label)** — update to match what the app now does:
   - Data Linked to You: Contact Info (email), User ID, Purchases (subscription
     status), User Content (birth details, chat messages, remembered facts),
     Sensitive Info is not collected.
   - Purpose for all of them: App Functionality. No Tracking, no Third-Party
     Advertising, no Analytics.
   - In the review notes and the privacy policy, say that birth details, chart,
     messages and remembered facts are sent to Anthropic (a third-party AI) to
     generate readings, with the user's explicit consent shown before first use.
5. **Privacy Policy URL**: `https://astra.shivvyas.com/privacy` (public page,
   `app/privacy/page.tsx`). Add a contact address to it first. Terms of Use: the
   paywall links Apple's standard EULA; if you write your own, put its URL in
   `PlusCopy.termsURL` and `TERMS_URL`.

### Local testing

The shared `Sanchara` scheme runs with `mobile/Sanchara/Astrya.storekit`, so the
paywall shows both products in the simulator with no App Store Connect setup.
Those purchases are signed by Xcode, not Apple, so `/api/billing/apple` answers
400 `invalid_transaction` (by design); the phone still shows Plus. To test the
server path, use a Sandbox tester on a device with a TestFlight or debug build
signed for the real bundle id, with the scheme's StoreKit configuration set to
None.

### Known follow-ups

Done 2026-10-09: `/api/timeline/explain`, `/api/timeline/scan` and the
server fallback of `/api/memory/ingest` call `requireConsent`, and the
scheduled jobs (daily readings, alerts, discoveries) skip anyone without a
current `ai_consents` row (`loadConsentedUserIds`; fails open while the table
is missing, like the chat route).
