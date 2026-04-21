/**
 * Single source of truth for all Umami analytics event names.
 *
 * Adding a new event — 4 steps:
 *   1. Add the name below in the right namespace (use snake_case).
 *   2. Call `trackUmamiEvent(EVENTS.<ns>.<name>, data?)` at the trigger site.
 *   3. Add a row to docs/UMAMI_ANALYTICS.md's Event catalog.
 *   4. If the event is a goal/funnel step, update the Goals/Journeys sections
 *      of that doc — remember Umami goals live in the dashboard, not in code.
 *
 * Why a const tree instead of scattered string literals?
 *   - Typos become TS errors via the EventName union.
 *   - Refactoring/renaming is safe (grep-and-replace a key, not a magic string).
 *   - Keeps the full tracked surface auditable at a glance.
 */

export const EVENTS = {
  auth: {
    signup_submit: 'auth_signup_submit',
    signup_success: 'auth_signup_success',
    login_submit: 'auth_login_submit',
    login_success: 'auth_login_success',
    logout: 'auth_logout',
    forgot_password: 'auth_forgot_password',
    reset_password_success: 'auth_reset_password_success',
  },
  onboarding: {
    start: 'onboarding_start',
    complete: 'onboarding_complete',
    skip: 'onboarding_skip',
  },
  discover: {
    search_submit: 'discover_search_submit',
    filter_toggle: 'discover_filter_toggle',
    city_click: 'discover_city_click',
    religion_click: 'discover_religion_click',
    map_pan: 'discover_map_pan',
    map_zoom: 'discover_map_zoom',
    place_card_click: 'discover_place_card_click',
  },
  place: {
    view: 'place_view',
    favorite_add: 'place_favorite_add',
    favorite_remove: 'place_favorite_remove',
    check_in_submit: 'place_check_in_submit',
    check_in_success: 'place_check_in_success',
    share_click: 'place_share_click',
    add_to_journey_click: 'place_add_to_journey_click',
    photo_carousel_scroll: 'place_photo_carousel_scroll',
  },
  review: {
    start: 'review_start',
    rating_select: 'review_rating_select',
    photo_upload: 'review_photo_upload',
    submit: 'review_submit',
    delete: 'review_delete',
  },
  journey: {
    create_start: 'journey_create_start',
    create_submit: 'journey_create_submit',
    place_add: 'journey_place_add',
    place_remove: 'journey_place_remove',
    invite_click: 'journey_invite_click',
    member_remove: 'journey_member_remove',
    join_submit: 'journey_join_submit',
    leave: 'journey_leave',
    complete: 'journey_complete',
  },
  profile: {
    language_change: 'profile_language_change',
    theme_toggle: 'profile_theme_toggle',
    religion_change: 'profile_religion_change',
    edit_submit: 'profile_edit_submit',
  },
  error: {
    boundary_trip: 'error_boundary_trip',
  },
} as const;

type LeafValues<T> = T extends string
  ? T
  : T extends Record<string, unknown>
    ? { [K in keyof T]: LeafValues<T[K]> }[keyof T]
    : never;

/** Union of every valid event-name string declared in EVENTS. */
export type EventName = LeafValues<typeof EVENTS>;

/**
 * Map a react-router pathname to a stable, human-readable page name for Umami
 * page-view reporting. Dynamic segments (e.g. placeCode, groupCode) are
 * collapsed to `:code` so we get one row per route template, not per entity.
 */
export function routeToPageName(pathname: string): string {
  if (!pathname || pathname === '/') return 'home';
  // Strip trailing slash + leading slash, then swap opaque code-like segments.
  const trimmed = pathname.replace(/^\/+|\/+$/g, '');
  const parts = trimmed.split('/').map((seg) => {
    // Treat any segment with a prefix_xxxxx pattern (e.g. plc_abc12) or bare
    // UUIDs/long hashes as an opaque id.
    if (/^[a-z]{2,6}_[a-z0-9]{4,}$/i.test(seg)) return ':code';
    if (/^[0-9a-f]{8,}$/i.test(seg)) return ':code';
    return seg;
  });
  return parts.join('/');
}
