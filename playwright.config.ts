import { defineConfig, devices } from "@playwright/test";

// E2E tests drive a REAL browser against a REAL running instance of the app
// — unlike tests/ (Vitest), which test isolated logic with everything
// mocked. This means these tests need `npm run dev` (or a production build)
// actually running, and a real Postgres database reachable and migrated.
//
// They deliberately only exercise the MANUAL builder path (no AI calls) —
// that's enough to watch a full journey get created end to end, without
// needing an OPENAI_API_KEY or spending API cost on every test run. See
// e2e/README.md for what's intentionally NOT covered here.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // journeys are created against one shared dev DB — keep this sequential
  workers: 1,
  retries: 0,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure", // lets you replay exactly what happened after a failure, click by click
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  // Not using Playwright's built-in webServer auto-start on purpose: this
  // project needs Postgres migrated first, which `npm run dev` alone
  // doesn't guarantee. Start the app yourself (see e2e/README.md) and point
  // PLAYWRIGHT_BASE_URL at it if it's not on the default port.
});
