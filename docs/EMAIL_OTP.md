# Email codes instead of magic links

Signing up or signing in by email sends a **six-digit code**, which the app asks
for on the next screen. On a phone that beats a link: the code is typed into the
app that is already open, with no hop out to a mail client and back, and no
Universal Link that can be swallowed by the wrong browser.

## The one setting this needs

Supabase decides link-versus-code by **what the email template contains**. A
template with only `{{ .ConfirmationURL }}` sends a link and no code — the app
will show its code screen and the person will have nothing to type.

Set two templates at
<https://supabase.com/dashboard/project/ekmsslcqkezxkeqjmvpi/auth/templates>:

| Template | Subject | Body |
|---|---|---|
| **Magic Link** (a code to sign in) | `{{ .Token }} is your Astrya code` | all of [`docs/email/magic-link.html`](email/magic-link.html) |
| **Confirm signup** (a new account) | `{{ .Token }} is your Astrya code` | all of [`docs/email/confirm-signup.html`](email/confirm-signup.html) |

The pictures are served from `public/images/email/`, so deploy the site before
pasting. With images off, the email still reads and the code is plain text.

Neither has a link. A link only works in the browser that asked for it, so one
opened from a mail app often failed, and a mail scanner can use it up first.
Links in emails sent before this still work, or say why they do not
(`app/auth/callback`). The code must be six digits (Auth > Providers > Email >
OTP length), which is what both code screens expect.

## How the website uses it

`sendEmailCode`, `verifyEmailCode` and `resendEmailCode` in
`app/(auth)/actions.ts`, entered on `/verify-email`. The address waits in an
httpOnly cookie (`lib/auth/pendingEmail.ts`). A sign-up for an address that
already has an account is a wrong password, not a wait: Supabase sends nothing.
An unconfirmed account gets a fresh code when it signs in.

## How the app uses it

- `sendEmailCode` calls `signInWithOTP`, then moves to the code screen.
- The code screen submits on its own once six digits are entered, and the field
  is marked `.oneTimeCode`, so iOS offers the code from the email above the
  keyboard.
- Verification is `verifyOTP(email:token:type:)` — type `.email` for
  passwordless, `.signup` for confirming an address after a password sign-up.
- Pasted codes are stripped to digits before sending, because mail clients
  wrap them in punctuation.

Codes expire after an hour by default; "Send a new code" re-sends through the
same path.
