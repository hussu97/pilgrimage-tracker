import type { Page } from '@playwright/test';

export const MOCK_USER = {
  user_code: 'usr_test01',
  display_name: 'Test User',
  email: 'test@example.com',
  role: 'user',
};

const MOCK_TOKEN = 'mock-jwt-token-for-e2e';

export const MOCK_PLACE = {
  place_code: 'plc_test01',
  name: 'Test Mosque',
  religion: 'islam',
  place_type: 'mosque',
  lat: 25.2048,
  lng: 55.2708,
  address: '123 Test Street, Dubai',
  description: 'A beautiful mosque for testing.',
  seo_slug: 'test-mosque',
  average_rating: 4.5,
  review_count: 10,
  images: [],
  attributes: [],
  is_favorited: false,
};

const MOCK_GROUP = {
  group_code: 'grp_test01',
  name: 'Test Journey',
  description: 'A journey for layout tests.',
  member_count: 1,
  total_sites: 1,
  checked_in_count: 0,
  is_private: false,
  path_place_codes: [MOCK_PLACE.place_code],
  places: [MOCK_PLACE],
  members: [],
  created_at: '2026-01-01T00:00:00Z',
};

const MOCK_TRANSLATIONS: Record<string, string> = {
  'app.name': 'SoulStep',
  'common.all': 'All',
  'common.appName': 'SoulStep',
  'common.backToHome': 'Back to Home',
  'common.clear': 'Clear',
  'common.creating': 'Creating...',
  'common.loading': 'Loading...',
  'common.loadMore': 'Load more',
  'common.moreCount': '+{count} more',
  'common.showMore': 'Show more',
  'common.skipToContent': 'Skip to content',
  'common.buddhism': 'Buddhism',
  'common.christianity': 'Christianity',
  'common.hinduism': 'Hinduism',
  'common.islam': 'Islam',
  'common.sikhism': 'Sikhism',
  'consent.acceptAll': 'Accept All',
  'consent.analytics': 'Analytics',
  'consent.body': 'We use cookies and similar technologies.',
  'consent.managePreferences': 'Manage Preferences',
  'consent.personalizedAds': 'Personalized ads',
  'consent.save': 'Save Preferences',
  'consent.title': 'Privacy & Cookies',
  'auth.login': 'Sign In',
  'auth.register': 'Create Account',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.name': 'Full Name',
  'auth.confirmPassword': 'Confirm Password',
  'auth.loginFailed': 'Invalid email or password',
  'auth.passwordRuleMinLength': 'At least 8 characters',
  'auth.passwordRuleUppercase': 'One uppercase letter',
  'auth.passwordRuleLowercase': 'One lowercase letter',
  'auth.passwordRuleDigit': 'One digit',
  'errors.loginFailed': 'Login failed',
  'dashboard.totalPlaces': 'Sacred sites to explore',
  'discover.metaTitle': 'Discover sacred places',
  'discover.metaDescription': 'Search, filter, and save sacred places.',
  'discover.title': 'Discover sacred places',
  'discover.subtitle': 'Search places, filter what matters, and add sites into a journey plan.',
  'discover.welcomeTitle': 'Start with a place',
  'discover.welcomeBody': 'Browse freely first. When a place feels right, add it to a journey.',
  'discover.welcomeAction': 'Got it',
  'discover.searchPlaceholder': 'Search sacred sites, cities, or traditions',
  'discover.openNow': 'Open now',
  'discover.topRated': 'Top rated',
  'discover.parking': 'Parking',
  'discover.womensArea': "Women's area",
  'discover.events': 'Events',
  'discover.results': 'Matching places',
  'discover.recommended': 'Recommended places',
  'discover.viewMap': 'Map view',
  'discover.noResults': 'No places match these filters.',
  'discover.placeAdded': 'Added to your journey plan.',
  'discover.journeysHint': 'Your saved plans live here after you pick places.',
  'discover.viewJourneys': 'View journeys',
  'discover.popularCities': 'Popular cities',
  'discover.cityPlaces': '{count} places',
  'discover.selectedCount': '{count} selected',
  'discover.createFromSelected': 'Create journey from {count}',
  'discover.allPlacesTitle': 'All sacred sites',
  'discover.allPlacesSubtitle': 'Use search and filters to browse the full catalog.',
  'footer.about': 'About',
  'footer.api': 'API',
  'footer.blog': 'Blog',
  'footer.contact': 'Contact',
  'footer.copyright': '© {year} SoulStep. All rights reserved.',
  'footer.privacy': 'Privacy Policy',
  'footer.terms': 'Terms of Service',
  'feedback.error': 'Something went wrong',
  'home.clearFilters': 'Clear filters',
  'nav.home': 'Home',
  'nav.discover': 'Discover',
  'nav.groups': 'Groups',
  'nav.journeys': 'Journeys',
  'nav.map': 'Map',
  'nav.profile': 'Profile',
  'map.addToJourney': 'Add to Journey',
  'place.favorites': 'Favorites',
  'place.name': 'Name',
  'place.address': 'Address',
  'places.checkIn': 'Check in',
  'places.closed': 'Closed',
  'places.open': 'Open',
  'places.unknown': 'Unknown',
  'places.visited': 'Visited',
  'groups.new': 'New Group',
  'groups.name': 'Group Name',
  'groups.description': 'Description',
  'groups.create': 'Create Group',
  'groups.createAndInvite': 'Create and Invite',
  'groups.descriptionLabel': 'Description',
  'groups.descriptionPlaceholder': 'Add a note for fellow pilgrims',
  'groups.empty': 'No groups yet',
  'groups.endDate': 'End date',
  'groups.groupName': 'Journey Name',
  'groups.groupNamePlaceholder': 'Journey name',
  'groups.inviteOnly': 'Invite only',
  'groups.anyoneWithLink': 'Anyone can join with the link',
  'groups.active': 'Active',
  'groups.activeStreak': 'Active Streak',
  'groups.completed': 'Completed',
  'groups.journeyCount': 'Journeys',
  'groups.level': 'Level {level}',
  'groups.loginRequired': 'Sign in to see your journeys',
  'groups.loginRequiredDesc': 'Join or create pilgrim journeys and track your journey together.',
  'groups.myGroups': 'My Groups',
  'groups.myJourneys': 'My Journeys',
  'groups.noGroupsDescription': 'Start by saving places into a journey.',
  'groups.noGroupsYet': 'No journeys yet',
  'groups.placesVisited': 'Sites Visited',
  'groups.progressNew': 'New',
  'groups.privateGroup': 'Private journey',
  'groups.shareMessage': 'Join my SoulStep journey',
  'groups.startDate': 'Start date',
  'journey.continueJourney': 'Continue journey',
  'journey.chooseAtLeastOnePlace': 'Choose at least one place',
  'journey.continueWithPlaces': 'Continue with {count} places',
  'journey.createJourney': 'Create Journey',
  'journey.joinWithCode': 'Join with code',
  'journey.placesCount': '{count} places',
  'journey.routeSummary': 'Route summary',
  'journey.selectedCount': '{count} selected',
  'journey.startExploring': 'Start exploring',
  'journey.stepChoosePlaces': 'Choose places',
  'journey.stepIntent': 'Intent',
  'journey.stepReview': 'Review',
  'journey.successDesc': 'Invite companions or start exploring now.',
  'journey.successTitle': 'Journey created',
  'search.placeholder': 'Search sacred sites...',
  'visitor.loginRequiredDesc': 'Sign in or create an account to continue.',
  'visitor.loginToPlanJourney': 'Log in to save this journey plan',
};

/** Register all API mocks on the given page. Call before navigating. */
export async function setupApiMocks(page: Page): Promise<void> {
  // Translations
  await page.route('**/api/v1/translations*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_TRANSLATIONS),
    });
  });

  // Languages
  await page.route('**/api/v1/languages', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ code: 'en', name: 'English', native_name: 'English' }]),
    });
  });

  // Field rules (used by Register page password validation)
  await page.route('**/api/v1/auth/field-rules', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        fields: [
          {
            name: 'password',
            rules: [
              { type: 'min_length', value: 8 },
              { type: 'require_uppercase' },
              { type: 'require_lowercase' },
              { type: 'require_digit' },
            ],
          },
        ],
      }),
    });
  });

  // Ads and consent
  await page.route('**/api/v1/ads/config*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        platform: 'web',
        ads_enabled: false,
        adsense_publisher_id: '',
        ad_slots: {},
      }),
    });
  });

  await page.route('**/api/v1/consent*', (route) => {
    const method = route.request().method();
    route.fulfill({
      status: method === 'POST' ? 201 : 200,
      contentType: 'application/json',
      body: JSON.stringify(method === 'POST' ? { status: 'ok' } : { ads: null, analytics: null }),
    });
  });

  await page.route('**/api/v1/analytics/events', (route) => {
    route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({}) });
  });

  await page.route('**/api/send', (route) => {
    route.fulfill({ status: 204, body: '' });
  });

  // Token refresh (called on mount when localStorage has a user)
  await page.route('**/api/v1/auth/refresh', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: MOCK_TOKEN }),
    });
  });

  // Auth: login
  await page.route('**/api/v1/auth/login', (route) => {
    const body = route.request().postDataJSON() as Record<string, string>;
    if (body.email === 'invalid@example.com') {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Invalid credentials' }),
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: MOCK_USER, token: MOCK_TOKEN }),
      });
    }
  });

  // Auth: register
  await page.route('**/api/v1/auth/register', (route) => {
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ user: MOCK_USER, token: MOCK_TOKEN }),
    });
  });

  // Current user (called after refresh)
  await page.route('**/api/v1/users/me', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_USER),
    });
  });

  await page.route('**/api/v1/users/me/settings', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ language: 'en', distance_unit: 'km', theme: 'system' }),
    });
  });

  // Visitor (created when not logged in)
  await page.route('**/api/v1/visitors', (route) => {
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ visitor_code: 'vis_test01', created_at: '2026-01-01T00:00:00Z' }),
    });
  });

  await page.route('**/api/v1/visitors/*/settings', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ language: 'en', distance_unit: 'km', theme: 'system' }),
    });
  });

  // Favorites
  await page.route('**/api/v1/places/*/favorites', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.route('**/api/v1/places/*/reviews*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 10 }),
    });
  });

  await page.route('**/api/v1/homepage*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        groups: [MOCK_GROUP],
        recommended_places: [
          {
            place_code: MOCK_PLACE.place_code,
            name: MOCK_PLACE.name,
            religion: MOCK_PLACE.religion,
            address: MOCK_PLACE.address,
            city: 'Dubai',
            image_url: null,
            distance_km: 1.2,
            lat: MOCK_PLACE.lat,
            lng: MOCK_PLACE.lng,
          },
        ],
        featured_journeys: [MOCK_GROUP],
        popular_places: [{ ...MOCK_PLACE, images: [] }],
        popular_cities: [{ city: 'Dubai', city_slug: 'dubai', count: 1, top_images: [] }],
        place_count: 1,
      }),
    });
  });

  await page.route('**/api/v1/blog/posts*', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  // Single place detail (must come before list pattern)
  await page.route(/\/api\/v1\/places\/plc_[^/?]+$/, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_PLACE),
    });
  });

  // Places list
  await page.route('**/api/v1/places*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [MOCK_PLACE],
        total: 1,
        page: 1,
        page_size: 20,
      }),
    });
  });

  // Groups list and create
  await page.route('**/api/v1/groups*', (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const isGroupsRoot = url.pathname === '/api/v1/groups';

    if (method === 'POST' && isGroupsRoot) {
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          group_code: 'grp_new01',
          name: 'My Test Group',
          description: '',
          invite_code: 'JOIN123',
          member_count: 1,
        }),
      });
      return;
    }

    if (method === 'POST') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    if (!isGroupsRoot && /^\/api\/v1\/groups\/[^/]+$/.test(url.pathname)) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_GROUP),
      });
      return;
    }

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([MOCK_GROUP]),
    });
  });

  await page.route('**/api/v1/notifications*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
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
      localStorage.setItem('user', JSON.stringify(user));
    },
    { user: MOCK_USER },
  );
}
