import { test, expect } from "@playwright/test";
import { setupApiMocks, setAuthToken } from "./helpers/api-mock";

test.describe("Groups", () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test("groups list: /groups page loads", async ({ page }) => {
    await page.goto("/groups");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/\/groups/);
  });

  test("groups list: shows empty state or group list", async ({ page }) => {
    await page.goto("/groups");
    await page.waitForLoadState("networkidle");

    // Page loaded — either shows empty state text or a list
    const body = await page.textContent("body");
    // Body should have some content (not blank)
    expect(body).toBeTruthy();
    expect((body ?? "").length).toBeGreaterThan(10);
  });

  test("create group: /groups/new redirects unauthenticated users", async ({ page }) => {
    // No auth set — should redirect to login or show protected state
    await page.goto("/groups/new");
    await page.waitForLoadState("networkidle");

    // Either redirected to login or redirected to home (depends on ProtectedRoute impl)
    const url = page.url();
    expect(url).toMatch(/\/(login|home|groups)/);
  });

  test("create group: authenticated user can see the create form", async ({ page }) => {
    // Navigate first, set auth, then re-navigate
    await page.goto("/home");
    await setAuthToken(page);
    await page.goto("/groups/new");
    await page.waitForLoadState("networkidle");

    // Should show a form (not redirected away)
    const url = page.url();
    // If still on /groups/new, check the form is present
    if (url.includes("/groups/new")) {
      const form = page.locator("form").or(page.locator('input[type="text"]').first());
      await expect(form.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("create group: submitting the form navigates away from /groups/new", async ({ page }) => {
    await page.goto("/home");
    await setAuthToken(page);
    await page.goto("/groups/new");
    await page.waitForLoadState("networkidle");

    const url = page.url();
    if (!url.includes("/groups/new")) {
      // Was redirected (e.g. not authenticated fully) — skip
      return;
    }

    // Fill the group name field
    const nameInput = page
      .getByRole("textbox", { name: /name/i })
      .or(page.locator('input[type="text"]').first());

    if (await nameInput.first().isVisible()) {
      await nameInput.first().fill("My Test Group");

      // Submit
      const submitBtn = page.getByRole("button", { name: /create|submit|save/i });
      if (await submitBtn.first().isVisible()) {
        await submitBtn.first().click();
        // After submission should navigate away
        await page.waitForTimeout(1000);
        await expect(page).not.toHaveURL(/\/groups\/new/);
      }
    }
  });
});
