import { test, expect } from "@playwright/test";
import { setupApiMocks } from "./helpers/api-mock";

test.describe("Authentication", () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test("login: fills email + password, submits, redirected to /home", async ({ page }) => {
    await page.goto("/login");

    // Fill in credentials
    await page.getByRole("textbox", { name: /email/i }).fill("test@example.com");
    await page.getByRole("textbox", { name: /password/i }).fill("Password1");

    // Submit form
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should redirect to home
    await expect(page).toHaveURL(/\/home/);
  });

  test("invalid login: shows error message", async ({ page }) => {
    await page.goto("/login");

    await page.getByRole("textbox", { name: /email/i }).fill("invalid@example.com");
    await page.getByRole("textbox", { name: /password/i }).fill("wrongpass");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should still be on login page and show an error
    await expect(page).toHaveURL(/\/login/);
    // Error message should appear somewhere on the page
    const errorText = page.locator("text=Invalid").or(page.locator("text=failed"));
    await expect(errorText.first()).toBeVisible({ timeout: 5000 });
  });

  test("register: fills name + email + password, submits form", async ({ page }) => {
    await page.goto("/register");

    // Wait for the form to load
    await page.waitForLoadState("networkidle");

    // Fill in registration fields
    const nameInput = page
      .getByRole("textbox", { name: /name/i })
      .or(page.locator('input[type="text"]').first());
    await nameInput.fill("New User");

    await page.getByRole("textbox", { name: /email/i }).fill("newuser@example.com");

    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.nth(0).fill("Password1");
    await passwordInputs.nth(1).fill("Password1");

    // Submit
    await page.getByRole("button", { name: /create account|register|sign up/i }).click();

    // Should navigate away from register page (to home or login)
    await expect(page).not.toHaveURL(/\/register/, { timeout: 5000 });
  });

  test("login page has link to register", async ({ page }) => {
    await page.goto("/login");
    const registerLink = page.getByRole("link", { name: /register|sign up|create/i });
    await expect(registerLink).toBeVisible();
  });
});
