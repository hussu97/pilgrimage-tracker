/**
 * App-wide route/screen names and storage keys. Match web app.
 */
export const ROUTES = {
  HOME: 'Home',
  LOGIN: 'Login',
  REGISTER: 'Register',
  SPLASH: 'Splash',
  FORGOT_PASSWORD: 'ForgotPassword',
  RESET_PASSWORD: 'ResetPassword',
  PROFILE: 'Profile',
  PROFILE_EDIT: 'EditProfile',
  FAVORITES: 'Favorites',
  GROUPS: 'Groups',
  GROUPS_NEW: 'CreateGroup',
  GROUP_DETAIL: 'GroupDetail',
  PLACE_DETAIL: 'PlaceDetail',
  PLACE_REVIEW: 'WriteReview',
  PROFILE_CHECK_INS: 'CheckInsList',
  JOIN: 'JoinGroup',
  NOTIFICATIONS: 'Notifications',
} as const;

export const LOCALE_STORAGE_KEY = 'soulstep-locale';
export const THEME_STORAGE_KEY = 'soulstep-theme';
export const USER_KEY = 'user';
export const VISITOR_KEY = 'visitor_code';
/** Default coordinates when location permission is denied or unavailable (used for getPlaces, etc.). */
export const DEFAULT_LAT = 0;
export const DEFAULT_LNG = 0;

/** Optional base URL for invite links (e.g. web app URL). When set, invite share uses /join?code=xxx */
export const INVITE_LINK_BASE_URL = process.env.EXPO_PUBLIC_INVITE_LINK_BASE_URL ?? '';
