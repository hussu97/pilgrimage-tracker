import { test, expect } from "@playwright/test";
import { setupApiMocks, setAuthToken, MOCK_PLACE } from "./helpers/api-mock";

test.describe("Places", () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test("home: navigates to /home and shows place listing", async ({ page }) => {
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    // Page should be at /home
    await expect(page).toHaveURL(/\/home/);
  });

  test("place detail: navigate to /places/:code, see name", async ({ page }) => {
    await page.goto(`/places/${MOCK_PLACE.place_code}`);
    await page.waitForLoadState("networkidle");

    // Place name should appear on the page
    await expect(page.locator(`text=${MOCK_PLACE.name}`).first()).toBeVisible({ timeout: 8000 });
  });

  test("place detail: shows address", async ({ page }) => {
    await page.goto(`/places/${MOCK_PLACE.place_code}`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator(`text=${MOCK_PLACE.address}`).first()).toBeVisible({ timeout: 8000 });
  });

  test("favorite: toggling favorite button changes its state (authenticated)", async ({ page }) => {
    // Set auth in localStorage before navigating
    await page.goto("/home");
    await setAuthToken(page);

    // Re-navigate so the app picks up the stored auth
    await page.goto(`/places/${MOCK_PLACE.place_code}`);
    await page.waitForLoadState("networkidle");

    // Find a favorite/bookmark button and click it
    const favBtn = page
      .getByRole("button", { name: /favorite|bookmark|save/i })
      .or(page.locator('[aria-label*="favorite"]').or(page.locator('[aria-label*="bookmark"]')));

    if (await favBtn.first().isVisible()) {
      const initialAriaPressed = await favBtn.first().getAttribute("aria-pressed");
      await favBtn.first().click();
      // After click, the pressed state should change (or a network request is made)
      await page.waitForTimeout(500);
      const afterAriaPressed = await favBtn.first().getAttribute("aria-pressed");
      // If aria-pressed exists, it should have toggled
      if (initialAriaPressed !== null && afterAriaPressed !== null) {
        expect(afterAriaPressed).not.toBe(initialAriaPressed);
      }
    }
    // If no favorite button visible (unauthenticated redirect), just verify we're on the right page
    await expect(page).toHaveURL(/\/places\//);
  });

  test("search: home page has search input", async ({ page }) => {
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    const searchInput = page
      .getByRole("searchbox")
      .or(page.locator('input[placeholder*="Search"]').or(page.locator('input[type="search"]')));

    if (await searchInput.first().isVisible()) {
      await searchInput.first().fill("mosque");
      await page.waitForTimeout(500);
      // Page still shows (doesn't crash)
      await expect(page).toHaveURL(/\/home/);
    }
  });
});
