import type { Page } from "@playwright/test";

export const MOCK_USER = {
  user_code: "usr_test01",
  display_name: "Test User",
  email: "test@example.com",
  role: "user",
};

const MOCK_TOKEN = "mock-jwt-token-for-e2e";

export const MOCK_PLACE = {
  place_code: "plc_test01",
  name: "Test Mosque",
  religion: "islam",
  place_type: "mosque",
  lat: 25.2048,
  lng: 55.2708,
  address: "123 Test Street, Dubai",
  description: "A beautiful mosque for testing.",
  seo_slug: "test-mosque",
  average_rating: 4.5,
  review_count: 10,
  images: [],
  attributes: [],
  is_favorited: false,
};

const MOCK_GROUP = {
  group_code: "grp_test01",
  name: "Test Journey",
  description: "A journey for layout tests.",
  member_count: 1,
  total_sites: 1,
  checked_in_count: 0,
  is_private: false,
  path_place_codes: [MOCK_PLACE.place_code],
  places: [MOCK_PLACE],
  members: [],
  created_at: "2026-01-01T00:00:00Z",
};

const MOCK_TRANSLATIONS: Record<string, string> = {
  "app.name": "SoulStep",
  "auth.login": "Sign In",
  "auth.register": "Create Account",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.name": "Full Name",
  "auth.confirmPassword": "Confirm Password",
  "auth.loginFailed": "Invalid email or password",
  "auth.passwordRuleMinLength": "At least 8 characters",
  "auth.passwordRuleUppercase": "One uppercase letter",
  "auth.passwordRuleLowercase": "One lowercase letter",
  "auth.passwordRuleDigit": "One digit",
  "errors.loginFailed": "Login failed",
  "nav.home": "Home",
  "nav.groups": "Groups",
  "nav.profile": "Profile",
  "place.favorites": "Favorites",
  "place.name": "Name",
  "place.address": "Address",
  "groups.new": "New Group",
  "groups.name": "Group Name",
  "groups.description": "Description",
  "groups.create": "Create Group",
  "groups.empty": "No groups yet",
  "search.placeholder": "Search sacred sites...",
};

/** Register all API mocks on the given page. Call before navigating. */
export async function setupApiMocks(page: Page): Promise<void> {
  // Translations
  await page.route("**/api/v1/translations*", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_TRANSLATIONS),
    });
  });

  // Languages
  await page.route("**/api/v1/languages", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ code: "en", name: "English", native_name: "English" }]),
    });
  });

  // Field rules (used by Register page password validation)
  await page.route("**/api/v1/auth/field-rules", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        fields: [
          {
            name: "password",
            rules: [
              { type: "min_length", value: 8 },
              { type: "require_uppercase" },
              { type: "require_lowercase" },
              { type: "require_digit" },
            ],
          },
        ],
      }),
    });
  });

  // Ads and consent
  await page.route("**/api/v1/ads/config*", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        platform: "web",
        ads_enabled: false,
        adsense_publisher_id: "",
        ad_slots: {},
      }),
    });
  });

  await page.route("**/api/v1/consent*", (route) => {
    const method = route.request().method();
    route.fulfill({
      status: method === "POST" ? 201 : 200,
      contentType: "application/json",
      body: JSON.stringify(method === "POST" ? { status: "ok" } : { ads: null, analytics: null }),
    });
  });

  await page.route("**/api/v1/analytics/events", (route) => {
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({}) });
  });

  await page.route("**/api/send", (route) => {
    route.fulfill({ status: 204, body: "" });
  });

  // Token refresh (called on mount when localStorage has a user)
  await page.route("**/api/v1/auth/refresh", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: MOCK_TOKEN }),
    });
  });

  // Auth: login
  await page.route("**/api/v1/auth/login", (route) => {
    const body = route.request().postDataJSON() as Record<string, string>;
    if (body.email === "invalid@example.com") {
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Invalid credentials" }),
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: MOCK_USER, token: MOCK_TOKEN }),
      });
    }
  });

  // Auth: register
  await page.route("**/api/v1/auth/register", (route) => {
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ user: MOCK_USER, token: MOCK_TOKEN }),
    });
  });

  // Current user (called after refresh)
  await page.route("**/api/v1/users/me", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_USER),
    });
  });

  // Visitor (created when not logged in)
  await page.route("**/api/v1/visitors", (route) => {
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ visitor_code: "vis_test01", created_at: "2026-01-01T00:00:00Z" }),
    });
  });

  // Favorites
  await page.route("**/api/v1/places/*/favorites", (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.route("**/api/v1/places/*/reviews*", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 10 }),
    });
  });

  await page.route("**/api/v1/homepage*", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        groups: [MOCK_GROUP],
        recommended_places: [
          {
            place_code: MOCK_PLACE.place_code,
            name: MOCK_PLACE.name,
            religion: MOCK_PLACE.religion,
            address: MOCK_PLACE.address,
            city: "Dubai",
            image_url: null,
            distance_km: 1.2,
            lat: MOCK_PLACE.lat,
            lng: MOCK_PLACE.lng,
          },
        ],
        featured_journeys: [MOCK_GROUP],
        popular_places: [{ ...MOCK_PLACE, images: [] }],
        popular_cities: [{ city: "Dubai", city_slug: "dubai", count: 1, top_images: [] }],
        place_count: 1,
      }),
    });
  });

  await page.route("**/api/v1/blog/posts*", (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  // Single place detail (must come before list pattern)
  await page.route(/\/api\/v1\/places\/plc_[^/?]+$/, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_PLACE),
    });
  });

  // Places list
  await page.route("**/api/v1/places*", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [MOCK_PLACE],
        total: 1,
        page: 1,
        page_size: 20,
      }),
    });
  });

  // Groups list and create
  await page.route("**/api/v1/groups*", (route) => {
    const method = route.request().method();
    if (method === "POST") {
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          group_code: "grp_new01",
          name: "My Test Group",
          description: "",
          member_count: 1,
        }),
      });
      return;
    }

    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [MOCK_GROUP], total: 1, page: 1, page_size: 20 }),
    });
  });

  await page.route("**/api/v1/notifications*", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 20, unread_count: 0 }),
    });
  });
}

/**
 * Seed localStorage so the app treats the current session as authenticated.
 * Call this after navigating to the page (so the page context is available).
 */
export async function setAuthToken(page: Page): Promise<void> {
  await page.evaluate(
    ({ user }) => {
      localStorage.setItem("user", JSON.stringify(user));
    },
    { user: MOCK_USER },
  );
}
