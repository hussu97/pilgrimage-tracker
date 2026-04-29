import { expect, test } from '@playwright/test';
import { MOCK_PLACE, setAuthToken, setupApiMocks } from './helpers/api-mock';

const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function enableAdsConsentBanner(page: import('@playwright/test').Page) {
  await page.route('**/api/v1/ads/config*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        platform: 'web',
        ads_enabled: true,
        adsense_publisher_id: 'ca-pub-test',
        ad_slots: {},
      }),
    });
  });
}

test.describe('Discovery-first journey flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('first visit shows clear non-stacked welcome and consent states', async ({ page }) => {
    await enableAdsConsentBanner(page);
    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Discover sacred places' })).toBeVisible();
    await expect(page.getByText('Start with a place')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Privacy & Cookies' })).toBeVisible();
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  });

  test('mobile navigation uses visible labeled destinations and active state', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav.getByRole('link', { name: /Discover/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /Map/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /Journeys/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /Profile/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /Discover/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('discover search and filter path can open a place detail', async ({ page }) => {
    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    await page.getByRole('textbox', { name: /Search sacred sites/i }).fill('mosque');
    await page.getByRole('button', { name: /Open now/i }).click();
    await expect(page.getByRole('heading', { name: MOCK_PLACE.name }).first()).toBeVisible();

    await page
      .locator(`a[href="/places/${MOCK_PLACE.place_code}"]`)
      .first()
      .click({ position: { x: 24, y: 24 } });
    await expect(page).toHaveURL(new RegExp(`/places/${MOCK_PLACE.place_code}`));
    await expect(page.getByRole('heading', { name: MOCK_PLACE.name }).first()).toBeVisible();
  });

  test('logged-out add-to-journey preserves the pending action after login', async ({ page }) => {
    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    await page
      .getByRole('button', { name: /Add to Journey/i })
      .first()
      .click();
    await expect(page.getByText('Log in to save this journey plan')).toBeVisible();

    await page.getByRole('textbox', { name: /Email/i }).fill('test@example.com');
    await page.getByRole('textbox', { name: /Password/i }).fill('Password1');
    await page
      .locator('form')
      .getByRole('button', { name: /^Sign In$/i })
      .click();

    await expect(page.getByText('1 selected')).toBeVisible();
    await expect(page.getByRole('button', { name: /Create journey from 1/i })).toBeVisible();
  });

  test('selected places tray starts journey creation with the selected place', async ({ page }) => {
    await page.goto('/home');
    await setAuthToken(page);
    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    await page
      .getByRole('button', { name: /Add to Journey/i })
      .first()
      .click();
    await page.getByRole('button', { name: /Create journey from 1/i }).click();

    await expect(page).toHaveURL(/\/journeys\/new/);
    await expect(page.getByText('1 selected')).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue with 1 places/i })).toBeVisible();
  });

  test('journeys is canonical and groups remains a compatibility redirect', async ({ page }) => {
    await page.goto('/journeys');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/journeys$/);
    await expect(page.getByRole('heading', { name: /My Journeys/i })).toBeVisible();

    await page.goto('/groups');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/journeys$/);
  });
});
