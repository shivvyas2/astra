# Contributing to Astrya

Thanks for looking. Astrya is a small codebase with a real architecture: a chart engine that must be right, a model that must only be handed computed facts, and two clients on one API. It is easier to contribute to than it looks, as long as you follow the few rules below. Each one was learned the hard way.

## Before you start

- **Open an issue first for anything bigger than a fix.** Say what you want to change and why. Features here start as a short design note in `docs/design/`, and it is much cheaper to agree on the note than on a finished pull request.
- **Read the handbook chapter** for the area you are touching. `docs/handbook/index.html` opens in a browser; the PDF and EPUB sit beside it. It explains why the code is shaped the way it is.
- **Set up as in the README.** The web app runs against any Supabase project with the migrations applied, and the iOS app builds with placeholder values, so you do not need production access to work on most of it.

## How the repo works

**One branch per change.** Never commit to `main`. Branch from it, open a pull request, and let CI run. Every push to `main` is a production deployment.

**Conventional commits.** `feat(timeline): ...`, `fix(astrology): ...`, `docs(handbook): ...`, `test(...)`, `refactor(...)`, `chore(...)`. The scope is the `lib/` module, the route, or the iOS feature folder. The subject is a sentence in plain words about what changed for the user, not what you did to the code.

**No em dashes.** In code comments, commit messages, docs, and UI strings. Use a comma, a period, or a colon.

**The chart is computed, never guessed.** Anything that reaches the model as a fact about a chart must come from `lib/astrology/`. If a reading needs something new, add it to the engine with a test, then to the prompt. Never let the prompt ask the model to work out a placement.

**Vedic houses are whole-sign; Western houses are Placidus.** Both charts and every consumer of them (the kundli PDF, the on-device tables, the dosha detectors) assume this. A change to house systems is a design note, not a commit.

**Every migration is a new numbered file.** Never edit a migration that has shipped. Row Level Security policies are the security boundary, so a new table without policies is a bug even if the code never reads it as anon.

**The two keys never leave the server.** `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` are read only through `lib/env.ts` in files marked `server-only`. The iOS build script reads only the Supabase URL and anon key. If your change needs a secret on a client, stop and open an issue.

**Secrets never enter the repo.** Not in code, not in docs, not in a test fixture, not in a screenshot. `.env.local` is gitignored. CI runs a secret scan of the full history on every pull request.

**The widget extension stays dependency-free.** The files compiled into `SancharaWidgets` are listed in `mobile/project.yml`. Nothing on that list may import Supabase or the API client.

## Tests

Run these before you push. They are what CI runs.

```sh
npm test                 # Vitest: chart engine, prompts, alerts, timeline, route handlers
npx tsc --noEmit         # Typecheck
npm run build            # Production build; needs no secrets
```

```sh
cd mobile
./scripts/make-config.sh && xcodegen generate
xcodebuild test -project Sanchara.xcodeproj -scheme Sanchara \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

New logic in `lib/` gets a test beside it (`foo.ts` and `foo.test.ts`). Route handlers get a test that calls the handler with a fake request. Swift logic that does not need a view goes in a type the XCTest suite can reach. Write the failing test first when you can; it keeps the change small.

## Pull requests

- Keep one change per pull request. A refactor and a feature are two pull requests.
- Fill in the template. Say what changed, why, and how you verified it. A screenshot or a short recording for anything visual.
- Add a line to `CHANGELOG.md` under Unreleased if a user would notice the change.
- Update the handbook chapter or the design note if behaviour changed. The handbook is built from `docs/handbook/src/chapters/` with `docs/handbook/make-book.sh`.
- Expect review comments about naming and about whether a fact belongs in the engine or in the prompt. Those are the two questions that keep this codebase honest.

## Design and visual work

The look is deliberate: near-black ground, warm off-white text, one orange, system sans. The four colours live in `app/globals.css` and are mirrored, hex for hex, in `mobile/Sanchara/Sources/Design/Theme.swift`. If a screen needs a fifth colour, that is a conversation, not a commit.

## Code of conduct

Be kind and be direct. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
