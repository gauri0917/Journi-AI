# End-to-end (E2E) tests

These are different from `tests/` (Vitest) — those test isolated logic with
everything mocked; nothing here talks to a real browser or a real database.
**This** folder drives an actual Chromium browser against your actual
running app and a real Postgres database — this is what lets you watch a
journey get created, step by step, in a real browser window.

## Prerequisites — this needs the real stack running

Unlike the unit tests, these cannot run against mocks. Before running
anything here:

```bash
docker compose up -d          # Postgres (with pgvector) running
npx prisma migrate dev        # schema applied
npm run dev                   # app running on localhost:3000
```

Leave all of that running in other terminal tabs, then run the E2E test
from a new tab in the same project folder.

## Running it

```bash
npx playwright install chromium   # one-time, downloads a browser binary
npm run test:e2e                  # headless — runs and reports pass/fail
```

## Actually watching it happen live

This is what answers "can I see it create a journey like on the site":

```bash
npm run test:e2e:headed
```

This opens a real, visible Chromium window and drives it in real time —
you'll watch the browser navigate to the new-journey page, type into the
fields, click "Add stage," click through to submit, mark the review, and
publish, exactly as if a person were doing it by hand.

Even better for actually inspecting what happened:

```bash
npm run test:e2e:ui
```

Playwright's UI mode — shows a timeline of every step, lets you click any
step to see a screenshot of the page at that exact moment, rewind, and
re-run just one test. This is the best way to actually watch and understand
the test, live or after the fact.

If a run fails, `npx playwright show-report` opens an HTML report with a
full trace — screenshots and a step-by-step replay of exactly what the
browser saw, without needing to reproduce the failure live.

## What this test covers, and what it deliberately doesn't

`create-journey.spec.ts` drives the **manual builder path only** — Add
stage, Add field, Continue, Submit for review, Review panel, Mark reviewed,
Publish — through the real UI, real API routes, and a real database. It
checks the full `draft → in_review → published` lifecycle actually works,
not just that the code that implements it is individually correct.

It does **not** cover the AI-drafting path ("Draft with AI"). That would
mean either hitting the real OpenAI API on every test run (slow, costs
money, and non-deterministic — a flaky E2E test is worse than no E2E test)
or mocking the API response at the network level, which is a reasonable
next step but adds real complexity (intercepting `page.route()` for the
OpenAI call) that wasn't worth building until this manual-path test is
confirmed working against your actual environment.

## A note on how this was built

I wrote this test by reading the actual component source (`BuilderWizard.tsx`,
`StageCard.tsx`, `ReviewPanel.tsx`, `JourneyActions.tsx`) to get exact button
labels and placeholder text, and verified it with `npx playwright test --list`
(confirms the file parses and Playwright can discover the test). I could
not run it against a live browser or database in the environment I built it
in — no Docker/Postgres available there — so unlike `tests/` (which I ran
and confirmed 44/44 passing), **this is the first time this specific test
will actually execute against your real app.** If a selector doesn't match
(e.g., if your UI text differs slightly from what's in the source I read),
Playwright's error output will name the exact line and what it expected to
find — that's a very fixable, well-signposted kind of failure, not a
mysterious one.
