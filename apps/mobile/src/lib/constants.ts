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
  SELECT_PATH: 'SelectPath',
  PROFILE: 'Profile',
  PROFILE_EDIT: 'EditProfile',
  FAVORITES: 'Favorites',
  GROUPS: 'Groups',
  GROUPS_NEW: 'CreateGroup',
  GROUP_DETAIL: 'GroupDetail',
  PLACE_DETAIL: 'PlaceDetail',
  PLACE_CHECK_IN: 'CheckIn',
  PLACE_REVIEW: 'WriteReview',
  PROFILE_CHECK_INS: 'CheckInsList',
  JOIN: 'JoinGroup',
  SETTINGS: 'Settings',
  NOTIFICATIONS: 'Notifications',
} as const;

export const LOCALE_STORAGE_KEY = 'pilgrimage-locale';
export const THEME_STORAGE_KEY = 'pilgrimage-theme';
export const TOKEN_KEY = 'token';
export const USER_KEY = 'user';
/** Set to 'true' after register so Main stack redirects to SelectPath */
export const SHOW_SELECT_PATH_KEY = 'pilgrimage-show-select-path';

/** Optional base URL for invite links (e.g. web app URL). When set, invite share uses /join?code=xxx */
export const INVITE_LINK_BASE_URL = process.env.EXPO_PUBLIC_INVITE_LINK_BASE_URL ?? '';
