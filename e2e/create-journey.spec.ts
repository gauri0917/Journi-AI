import { test, expect } from "@playwright/test";

// This is the test that lets you literally watch a journey get created:
//   npx playwright test --headed        (opens a real browser window, watch it live)
//   npx playwright test --ui            (Playwright's interactive UI — step through, rewind, inspect)
// See e2e/README.md for prerequisites (dev server + migrated database).
//
// Deliberately uses the MANUAL builder path (Add stage / Add field), not
// "Draft with AI" — that keeps this test fast, free, and independent of
// OPENAI_API_KEY, while still exercising the full basics -> stages ->
// review -> submit -> publish lifecycle through the real UI and a real
// database, which is exactly the part the mocked unit tests in tests/
// cannot exercise.

test.describe("Journey creation — manual builder, end to end", () => {
  test("create a journey, submit for review, mark reviewed, and publish", async ({ page }) => {
    const uniqueName = `E2E Test Journey ${Date.now()}`;

    // --- Basics step ---
    await page.goto("/journeys/new");
    await expect(page.getByRole("heading", { name: "New journey" })).toBeVisible();

    await page.getByPlaceholder("e.g. Mid-Market SaaS Onboarding").fill(uniqueName);
    await page.getByPlaceholder("What this journey is for, and who it's for.").fill(
      "Created by an automated Playwright E2E test."
    );
    await page.getByPlaceholder("e.g. SaaS Subscription").fill("SaaS Subscription");
    await page.getByRole("button", { name: "Continue to stages →" }).click();

    // --- Stages step ---
    await expect(page.getByText("0 stages")).toBeVisible();
    await page.getByRole("button", { name: "+ Add stage" }).click();

    await page.getByPlaceholder("e.g. Legal Review").fill("Qualification");
    await page.getByPlaceholder("e.g. legal_counsel").fill("sales_rep");

    await page.getByRole("button", { name: "+ Add field" }).click();
    await page.getByPlaceholder("Field label").fill("Company name");

    await page.getByRole("button", { name: "Continue to reviewers →" }).click();

    // --- Review step ---
    await page
      .getByPlaceholder("e.g. legal_counsel, deal_desk, finance")
      .fill("deal_desk");
    await expect(page.getByText(uniqueName)).toBeVisible();

    await page.getByRole("button", { name: "Submit for review" }).click();

    // --- Landed on the journey detail page, now in_review ---
    await expect(page).toHaveURL(/\/journeys\/[a-zA-Z0-9-]+$/);
    await expect(page.getByRole("heading", { name: uniqueName })).toBeVisible();
    await expect(page.getByText("in review", { exact: false })).toBeVisible();

    // --- Mark the one reviewer as reviewed ---
    // ReviewPanel lives on a separate /review sub-page, not the main
    // journey detail page — linked via "Review panel →". Missing this
    // navigation step was an early mistake in this test.
    await page.getByRole("link", { name: "Review panel →" }).click();
    await expect(page).toHaveURL(/\/journeys\/[a-zA-Z0-9-]+\/review$/);

    // Expanding the row requires clicking "Review as {role}" first, then
    // entering a name (required by the API) before "Mark reviewed" appears.
    await page.getByRole("button", { name: "Review as deal_desk" }).click();
    await page.getByPlaceholder("Your name").fill("Playwright E2E");
    await page.getByRole("button", { name: "Mark reviewed" }).click();
    await expect(page.getByText("reviewed", { exact: false }).first()).toBeVisible();

    // --- Back to the journey detail page to publish ---
    await page.goto(page.url().replace(/\/review$/, ""));
    const publishButton = page.getByRole("button", { name: "Publish" });
    await expect(publishButton).toBeEnabled({ timeout: 5000 });
    await publishButton.click();

    await expect(page.getByText("published", { exact: false }).first()).toBeVisible();
  });
});
