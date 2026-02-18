/**
 * App-wide route paths and constants.
 */
export const ROUTES = {
  HOME: '/home',
  LOGIN: '/login',
  REGISTER: '/register',
  SPLASH: '/',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  SELECT_PATH: '/select-path',
  PROFILE: '/profile',
  PROFILE_EDIT: '/profile/edit',
  FAVORITES: '/favorites',
  GROUPS: '/groups',
  GROUPS_NEW: '/groups/new',
  GROUP_DETAIL: '/groups/:groupCode',
  PLACE_DETAIL: '/places/:placeCode',
  PLACE_CHECK_IN: '/places/:placeCode/check-in',
  PLACE_REVIEW: '/places/:placeCode/review',
  PROFILE_CHECK_INS: '/profile/check-ins',
  JOIN: '/join',
  SETTINGS: '/settings',
  NOTIFICATIONS: '/notifications',
} as const;

export const LOCALE_STORAGE_KEY = 'pilgrimage-locale';
export const THEME_STORAGE_KEY = 'pilgrimage-theme';
export const TOKEN_KEY = 'token';
export const USER_KEY = 'user';
export const VISITOR_KEY = 'visitor_code';

/** Default coordinates when location permission is denied or unavailable (used for getPlaces, etc.). */
export const DEFAULT_LAT = 0;
export const DEFAULT_LNG = 0;
