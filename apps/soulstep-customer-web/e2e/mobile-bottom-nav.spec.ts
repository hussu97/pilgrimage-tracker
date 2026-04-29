import { expect, test } from "@playwright/test";
import { MOCK_PLACE, setAuthToken, setupApiMocks } from "./helpers/api-mock";

const MOBILE_VIEWPORT = { width: 390, height: 844 };

const ROUTES = [
  "/home",
  "/places",
  "/groups",
  `/places/${MOCK_PLACE.place_code}`,
  "/map",
];

async function assertActionablesClearBottomNav(page: import("@playwright/test").Page) {
  const offenders = await page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>('nav[aria-label="Main navigation"]');
    if (!nav) return [];

    const navRect = nav.getBoundingClientRect();
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(
        [
          'a[href]',
          'button:not([disabled])',
          'input:not([disabled])',
          'select:not([disabled])',
          'textarea:not([disabled])',
          '[role="button"]',
        ].join(','),
      ),
    );

    return elements
      .filter((el) => {
        if (el.closest('nav[aria-label="Main navigation"]')) return false;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const isVisible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 1 &&
          rect.height > 1 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight;
        const overlapsBottomNav = rect.bottom > navRect.top + 1 && rect.top < navRect.bottom - 1;
        return isVisible && overlapsBottomNav;
      })
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          label: el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 80) ?? "",
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          navTop: Math.round(navRect.top),
        };
      });
  });

  expect(offenders).toEqual([]);
}

test.describe("mobile bottom navigation layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await setupApiMocks(page);
    await page.goto("/home");
    await setAuthToken(page);
  });

  for (const route of ROUTES) {
    test(`${route} keeps bottom actions above the nav`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(300);

      await expect(page.locator('nav[aria-label="Main navigation"]')).toBeVisible();
      await assertActionablesClearBottomNav(page);
    });
  }
});
