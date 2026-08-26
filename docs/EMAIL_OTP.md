# Email codes instead of magic links

Signing up or signing in by email sends a **six-digit code**, which the app asks
for on the next screen. On a phone that beats a link: the code is typed into the
app that is already open, with no hop out to a mail client and back, and no
Universal Link that can be swallowed by the wrong browser.

## The one setting this needs

Supabase decides link-versus-code by **what the email template contains**. A
template with only `{{ .ConfirmationURL }}` sends a link and no code — the app
will show its code screen and the person will have nothing to type.

Add `{{ .Token }}` to two templates at
<https://supabase.com/dashboard/project/ekmsslcqkezxkeqjmvpi/auth/templates>:

### Magic Link — used for passwordless sign-in and sign-up

```html
<h2>Your Astra code</h2>
<p>Enter this code in the app:</p>
<p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
<p>It expires in an hour and can be used once.</p>
<p>Prefer a link? <a href="{{ .ConfirmationURL }}">Open Astra</a>.</p>
```

### Confirm signup — used after a sign-up with a password

```html
<h2>Confirm your email</h2>
<p>Enter this code in Astra to finish setting up your account:</p>
<p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
<p>Prefer a link? <a href="{{ .ConfirmationURL }}">Confirm your email</a>.</p>
```

Keeping the link in both is deliberate: anyone who taps it still lands in the
app through the Universal Link, and the web app keeps working unchanged.

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
