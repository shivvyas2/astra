# Phone sign-in (India and US)

The app and the website both offer **Email | Phone** on the sign-in and sign-up
screens. Phone sends a six-digit code by text; the first code creates the
account, so sign-in and sign-up are one path. Numbers are validated before
anything is sent: Indian mobiles (+91, starting 6–9) and US numbers (+1).

- iOS: `mobile/Sanchara/Sources/Features/Auth/PhoneNumber.swift`, `AuthStore.sendPhoneCode`
- Web: `lib/auth/phone.ts`, `app/(auth)/actions.ts` (`sendPhoneCode`, `verifyPhoneCode`),
  `app/(auth)/verify-phone`. The number waiting for its code is kept in the
  httpOnly cookie `astrya_pending_phone` for ten minutes, not in the URL.

Until the provider below is switched on, choosing Phone shows "Phone sign-in
isn't available right now" and nothing else breaks.

## Setup: Twilio Verify as Supabase's SMS provider

Twilio Verify is used rather than a plain Twilio number because it handles
India's DLT rules (registered sender IDs and templates) itself.

1. **Twilio** (<https://console.twilio.com>)
   - Verify › Services › *Create new*: name it `Astrya`, code length **6**.
   - Copy the **Service SID** (`VA…`).
   - Verify › Settings › **Geo permissions**: allow **India** and **United States**.
   - From the console home, copy the **Account SID** (`AC…`) and **Auth Token**.
2. **Supabase** (<https://supabase.com/dashboard/project/ekmsslcqkezxkeqjmvpi/auth/providers>)
   - Providers › **Phone**: enable, and turn on **Enable phone signup**.
   - SMS provider: **Twilio Verify**. Paste the Account SID, Auth Token and
     Verify Service SID. Save.
   - Auth › Rate limits: keep SMS at a sensible ceiling (for example 30 an
     hour) so the Twilio bill cannot run away.
3. Try it: sign up by phone in the app with your own number, then sign in
   again with the same number on the website. Both should land in the same
   account.

Cost is per verification (about $0.05 in India and the US at the time of
writing); see Twilio's Verify pricing.
