## What changed

<!-- One or two sentences in plain words. What does the user get? -->

## Why

<!-- Link the issue or the design note in docs/design/. -->

## How I verified it

- [ ] `npm test` and `npx tsc --noEmit`
- [ ] `npm run build`
- [ ] iOS: `xcodegen generate` and the XCTest suite, if I touched `mobile/`
- [ ] Ran the web app or the iOS app and exercised the change

<!-- Screenshot or recording for anything visual. -->

## Checklist

- [ ] One change per pull request
- [ ] Conventional commit messages, no em dashes
- [ ] Any new chart fact comes from `lib/astrology/` with a test, not from the prompt
- [ ] New tables and columns ship in a new numbered migration with RLS policies
- [ ] No secrets, and nothing personal in fixtures or screenshots
- [ ] `CHANGELOG.md` and the handbook chapter or design note updated if behaviour changed
