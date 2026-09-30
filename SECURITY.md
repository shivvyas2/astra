# Security

Sanchara handles birth details, private conversations, and push tokens. If you find a vulnerability, please report it privately.

## Reporting

Use GitHub's private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. Do not open a public issue for security problems.

Include what you found, how to reproduce it, and what data or accounts it could affect. You will get an acknowledgement within a few days and a fix or a plan within two weeks for anything that exposes user data.

## What counts

- Any way to read another user's rows through the Supabase REST API or a route handler. Row Level Security is the boundary; a policy gap is a vulnerability.
- Any route under `/api/` that accepts a request without a valid session or bearer token when it should not, or that trusts a user id from the request body.
- The service-role key or the model API key reaching a client, a build artifact, or a log.
- The cron route running without its secret.
- Prompt injection that makes the model reveal another user's chart or conversation.
- App Group, Keychain, or Universal Link handling on iOS that exposes data to another app.

## What is out of scope

- Issues that require a jailbroken device or physical access to an unlocked phone.
- Rate limiting on your own self-hosted deployment.
- Findings in third-party services (Supabase, Vercel, Apple, Anthropic) that are not caused by this code.
- The Supabase anon key and project URL. They are designed to ship in clients; Row Level Security gates every row.

## Supported versions

Only the latest release on `main` receives security fixes.
