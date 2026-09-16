# Sign in with Apple

The app signs in natively: Apple returns an identity token, and Supabase
verifies it directly (`signInWithIdToken`). No web sheet, no redirect, no
password, and no confirmation email — it is the fastest path onto Sanchara.

## 1. Enable the provider in Supabase (required)

**This is what causes `Issuer https://appleid.apple.com is not enabled`.** The
app is doing its part; the project just has the Apple provider switched off.

1. Open
   <https://supabase.com/dashboard/project/ekmsslcqkezxkeqjmvpi/auth/providers>
2. **Apple** → toggle **Enable Sign in with Apple**.
3. In **Client IDs**, enter the app's bundle id:

   ```
   com.shivvyas.astra
   ```

   It is a comma-separated list, so a future Mac or watch app can be added here
   too.
4. **Save.**

For the **native** flow that is the whole configuration — Secret Key, Services
ID, Team ID, and Key ID are only needed if you also want *Sign in with Apple on
the website*, which uses Apple's web OAuth redirect instead of an identity
token. Leave them blank until then.

If you would rather not use the dashboard, the same change through the
Management API (needs a personal access token from
<https://supabase.com/dashboard/account/tokens>):

```bash
curl -X PATCH "https://api.supabase.com/v1/projects/ekmsslcqkezxkeqjmvpi/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"external_apple_enabled": true, "external_apple_client_id": "com.shivvyas.astra"}'
```

## 2. Enable the capability on the App ID (required for real devices)

The simulator will sign in as soon as step 1 is done. A build installed on a
phone, or uploaded to TestFlight, also needs the capability on the App ID or
code signing fails:

1. developer.apple.com → **Certificates, Identifiers & Profiles** →
   **Identifiers** → `com.shivvyas.astra`.
2. Tick **Sign In with Apple**, save. Automatic signing regenerates the profile.

`mobile/project.yml` already carries the matching entitlement
(`com.apple.developer.applesignin: [Default]`).

## How the app uses it

- A random nonce is generated per attempt; its SHA-256 goes to Apple, the raw
  value goes to Supabase. That pairing is what stops a captured token being
  replayed against the project (`AppleSignIn.randomNonce`).
- Apple returns the person's **name only on the very first authorization ever**
  for this App ID. It is kept in `UserDefaults` and used to pre-fill first and
  last name on the birth-details screen, so signup is two taps and a birthday.
- Cancelling the sheet is treated as a normal action, not an error.

### Re-testing the first-run name

Because the name comes back only once, testing the pre-fill again means telling
Apple to forget the app: **Settings → your Apple ID → Sign in with Apple →
Sanchara → Stop using Apple ID**, then sign in again. A freshly created simulator
also works.

## Known gap: Apple token revocation on account deletion

Apple's guideline 5.1.1(v) asks apps that offer Sign in with Apple to **revoke**
the Apple token when a user deletes their account. `DELETE /api/account`
currently deletes the Supabase user (and everything cascading from it) but does
not call `https://appleid.apple.com/auth/revoke`.

Closing it needs, in order:

1. A Services ID and a `.p8` auth key, to mint the Apple client secret JWT.
2. Capturing `credential.authorizationCode` at sign-in and posting it to the
   backend, which exchanges it at `https://appleid.apple.com/auth/token` for a
   refresh token and stores it against the user.
3. `POST https://appleid.apple.com/auth/revoke` with that token during account
   deletion, before the Supabase user is removed.

Worth doing before the first App Store submission that includes Apple sign-in.
