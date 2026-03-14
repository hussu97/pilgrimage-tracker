import type {
  Place,
  PlaceDetail,
  User,
  Religion,
  Review,
  ReviewsResponse,
  CheckIn,
  UserStats,
  Group,
  GroupMember,
  LeaderboardEntry,
  ActivityItem,
  Notification,
  UserSettings,
  LanguageOption,
  PlacesResponse,
} from '@/lib/types';
import type { ChecklistResponse, PlaceNote } from '@/lib/types/groups';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// In-memory token — never persisted to localStorage (prevents XSS token theft).
// The backend also sets the access token as an httpOnly cookie for session persistence
// across page reloads. The cookie is automatically included via credentials:'include'.
let _inMemoryToken: string | null = null;

/** Set or clear the in-memory access token. Called by AuthProvider on login/logout/refresh. */
export function setClientToken(token: string | null): void {
  _inMemoryToken = token;
}

// ─── Locale tracking for place API calls ──────────────────────────────────────
let _currentLocale: string = 'en';

/** Update the locale injected into place-related API calls. */
export function setApiLocale(lang: string): void {
  _currentLocale = lang;
}

export type { LanguageOption };

/** Static client-identification headers sent with every request. */
export function clientHeaders(): Record<string, string> {
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  return {
    'X-Content-Type': isMobile ? 'mobile' : 'desktop',
    'X-App-Type': 'web',
    'X-Platform': 'web',
  };
}

export async function getLanguages(): Promise<LanguageOption[]> {
  const res = await fetch(`${API_BASE}/api/v1/languages`, { headers: clientHeaders() });
  if (!res.ok) throw new Error('Failed to fetch languages');
  return res.json();
}

export async function getTranslations(lang: string): Promise<Record<string, string>> {
  const res = await fetch(`${API_BASE}/api/v1/translations?lang=${encodeURIComponent(lang)}`, {
    headers: clientHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch translations');
  return res.json();
}

function getToken(): string | null {
  return _inMemoryToken;
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...clientHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ─── Token refresh & auth interceptor ─────────────────────────────────────────

export async function refreshToken(): Promise<{ token: string }> {
  const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: clientHeaders(),
  });
  if (!res.ok) throw new Error('Token refresh failed');
  return res.json();
}

export async function logoutServer(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/v1/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: clientHeaders(),
    });
  } catch {
    // Best-effort server logout; local state is cleared regardless
  }
}

let refreshInFlight: Promise<string> | null = null;

async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...init, credentials: 'include' });
  if (res.status !== 401 || !getToken()) return res;

  // Deduplicate concurrent refresh attempts
  if (!refreshInFlight) {
    refreshInFlight = refreshToken()
      .then(({ token }) => {
        setClientToken(token);
        return token;
      })
      .catch((err) => {
        setClientToken(null);
        throw err;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  try {
    const newToken = await refreshInFlight;
    const retryHeaders = new Headers(init?.headers as HeadersInit);
    retryHeaders.set('Authorization', `Bearer ${newToken}`);
    return fetch(url, { ...init, headers: retryHeaders, credentials: 'include' });
  } catch {
    return res; // Return original 401 if refresh failed
  }
}

export interface PasswordRule {
  type: 'min_length' | 'require_uppercase' | 'require_lowercase' | 'require_digit';
  value?: number;
}

export interface FieldRule {
  name: string;
  required: boolean;
  rules: PasswordRule[];
}

export interface FieldRulesResponse {
  fields: FieldRule[];
}

export async function getFieldRules(): Promise<FieldRulesResponse> {
  const res = await fetch(`${API_BASE}/api/v1/auth/field-rules`, { headers: clientHeaders() });
  if (!res.ok) throw new Error('Failed to fetch field rules');
  return res.json();
}

export interface GetPlacesParams {
  religions?: Religion[];
  lat?: number;
  lng?: number;
  radius?: number;
  place_type?: string;
  search?: string;
  sort?: string;
  limit?: number;
  cursor?: string;
  open_now?: boolean;
  has_parking?: boolean;
  womens_area?: boolean;
  has_events?: boolean;
  top_rated?: boolean;
  include_checkins?: boolean;
  min_lat?: number;
  max_lat?: number;
  min_lng?: number;
  max_lng?: number;
  city?: string;
}

export interface FeaturedGroup {
  group_code: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  total_sites: number;
  member_count: number;
  path_place_codes: string[];
}

export async function getFeaturedGroups(): Promise<FeaturedGroup[]> {
  const res = await fetch(`${API_BASE}/api/v1/groups/featured`, { headers: clientHeaders() });
  if (!res.ok) throw new Error('Failed to fetch featured groups');
  return res.json();
}

export async function getPlaces(params?: GetPlacesParams): Promise<PlacesResponse> {
  const sp = new URLSearchParams();
  if (params?.religions?.length) params.religions.forEach((r) => sp.append('religion', r));
  if (params?.lat != null) sp.set('lat', String(params.lat));
  if (params?.lng != null) sp.set('lng', String(params.lng));
  if (params?.radius != null) sp.set('radius', String(params.radius));
  if (params?.place_type) sp.set('place_type', params.place_type);
  if (params?.search) sp.set('search', params.search);
  if (params?.sort) sp.set('sort', params.sort);
  if (params?.limit != null) sp.set('limit', String(params.limit));
  if (params?.cursor) sp.set('cursor', params.cursor);
  if (params?.open_now) sp.set('open_now', 'true');
  if (params?.has_parking) sp.set('has_parking', 'true');
  if (params?.womens_area) sp.set('womens_area', 'true');
  if (params?.has_events) sp.set('has_events', 'true');
  if (params?.top_rated) sp.set('top_rated', 'true');
  if (params?.include_checkins) sp.set('include_checkins', 'true');
  if (params?.min_lat != null) sp.set('min_lat', String(params.min_lat));
  if (params?.max_lat != null) sp.set('max_lat', String(params.max_lat));
  if (params?.min_lng != null) sp.set('min_lng', String(params.min_lng));
  if (params?.max_lng != null) sp.set('max_lng', String(params.max_lng));
  if (params?.city) sp.set('city', params.city);
  if (_currentLocale && _currentLocale !== 'en') sp.set('lang', _currentLocale);

  const qs = sp.toString();
  const url = `${API_BASE}/api/v1/places${qs ? `?${qs}` : ''}`;
  const res = await authFetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch places');
  const data = await res.json();
  // Server returns { places: [...], filters: { options: [...] } }
  const rawPlaces = data.places || [];
  return {
    places: rawPlaces.map((r: Place | [Place, number]) => {
      // Handle both [place, distance] tuple and plain place object formats
      const isArray = Array.isArray(r);
      const p = isArray ? r[0] : r;
      if (isArray && r[1] != null) {
        p.distance = r[1];
      }
      return p;
    }),
    filters: data.filters ?? null,
    next_cursor: data.next_cursor ?? null,
  };
}

export interface RegisterBody {
  email: string;
  password: string;
  display_name?: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export async function register(body: RegisterBody): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...clientHeaders() },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Registration failed');
  return data;
}

export async function login(body: LoginBody): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...clientHeaders() },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Login failed');
  return data;
}

export async function getMe(): Promise<User> {
  const res = await authFetch(`${API_BASE}/api/v1/users/me`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to fetch user');
  return data;
}

export async function updateMe(updates: { display_name?: string }): Promise<User> {
  const res = await authFetch(`${API_BASE}/api/v1/users/me`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Update failed');
  return data;
}

export async function forgotPassword(email: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/v1/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...clientHeaders() },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

export async function resetPassword(token: string, newPassword: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/api/v1/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...clientHeaders() },
    body: JSON.stringify({ token, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Reset failed');
  return data;
}

export async function getPlace(
  placeCode: string,
  coords?: { lat: number; lng: number },
): Promise<PlaceDetail> {
  const sp = new URLSearchParams();
  if (coords?.lat != null) sp.set('lat', String(coords.lat));
  if (coords?.lng != null) sp.set('lng', String(coords.lng));
  if (_currentLocale && _currentLocale !== 'en') sp.set('lang', _currentLocale);
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  const res = await authFetch(`${API_BASE}/api/v1/places/${placeCode}${qs}`, {
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Place not found');
  return data;
}

export async function getPlaceReviews(placeCode: string, limit = 5): Promise<ReviewsResponse> {
  const sp = new URLSearchParams({ limit: String(limit) });
  if (_currentLocale && _currentLocale !== 'en') sp.set('lang', _currentLocale);
  const res = await fetch(`${API_BASE}/api/v1/places/${placeCode}/reviews?${sp}`, {
    headers: clientHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch reviews');
  return res.json();
}

export async function checkIn(
  placeCode: string,
  body?: { note?: string; photo_url?: string; group_code?: string },
): Promise<CheckIn> {
  const res = await authFetch(`${API_BASE}/api/v1/places/${placeCode}/check-in`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Check-in failed');
  return data;
}

export async function addFavorite(placeCode: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/places/${placeCode}/favorite`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to add favorite');
}

export async function removeFavorite(placeCode: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/places/${placeCode}/favorite`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to remove favorite');
}

export async function getMyCheckIns(): Promise<CheckIn[]> {
  const res = await authFetch(`${API_BASE}/api/v1/users/me/check-ins`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch check-ins');
  const data = await res.json();
  return data;
}

export async function getThisMonthCheckIns(): Promise<CheckIn[]> {
  const res = await authFetch(`${API_BASE}/api/v1/users/me/check-ins/this-month`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch this month check-ins');
  return res.json();
}

export async function getOnThisDayCheckIns(): Promise<CheckIn[]> {
  const res = await authFetch(`${API_BASE}/api/v1/users/me/check-ins/on-this-day`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch on-this-day check-ins');
  return res.json();
}

export async function getMyStats(): Promise<UserStats> {
  const res = await authFetch(`${API_BASE}/api/v1/users/me/stats`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function getMyFavorites(): Promise<Place[]> {
  const res = await authFetch(`${API_BASE}/api/v1/users/me/favorites`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch favorites');
  return res.json();
}

export async function uploadReviewPhoto(file: Blob): Promise<{
  id: number;
  url: string;
  width: number;
  height: number;
}> {
  const formData = new FormData();
  formData.append('file', file, 'photo.jpg');

  const token = getToken();
  const res = await authFetch(`${API_BASE}/api/v1/reviews/upload-photo`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Don't set Content-Type - browser will set it with boundary for multipart/form-data
    },
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to upload photo');
  return data;
}

export async function createReview(
  placeCode: string,
  body: {
    rating: number;
    title?: string;
    body?: string;
    is_anonymous?: boolean;
    photo_urls?: string[];
  },
): Promise<Review> {
  const res = await authFetch(`${API_BASE}/api/v1/places/${placeCode}/reviews`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to submit review');
  return data;
}

export async function updateReview(
  reviewCode: string,
  body: { rating?: number; title?: string; body?: string },
): Promise<Review> {
  const res = await authFetch(`${API_BASE}/api/v1/reviews/${reviewCode}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to update review');
  return data;
}

export async function deleteReview(reviewCode: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/reviews/${reviewCode}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? 'Failed to delete review');
  }
}

export async function getGroups(): Promise<Group[]> {
  const res = await authFetch(`${API_BASE}/api/v1/groups`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch groups');
  return res.json();
}

export async function uploadGroupCover(file: Blob): Promise<{
  image_code: string;
  url: string;
  width: number;
  height: number;
}> {
  const formData = new FormData();
  formData.append('file', file, 'cover.jpg');

  const token = getToken();
  const res = await authFetch(`${API_BASE}/api/v1/groups/upload-cover`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to upload cover image');
  return data;
}

export async function createGroup(body: {
  name: string;
  description?: string;
  is_private?: boolean;
  path_place_codes?: string[];
  cover_image_url?: string;
  start_date?: string;
  end_date?: string;
}): Promise<Group & { invite_code: string }> {
  const res = await authFetch(`${API_BASE}/api/v1/groups`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to create group');
  return data;
}

export async function getGroup(groupCode: string): Promise<Group> {
  const res = await authFetch(`${API_BASE}/api/v1/groups/${groupCode}`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Group not found');
  return data;
}

export async function updateGroup(
  groupCode: string,
  body: {
    name?: string;
    description?: string;
    is_private?: boolean;
    path_place_codes?: string[];
    cover_image_url?: string;
    start_date?: string;
    end_date?: string;
  },
): Promise<Group> {
  const res = await authFetch(`${API_BASE}/api/v1/groups/${groupCode}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to update group');
  return data;
}

export async function getGroupByInviteCode(
  inviteCode: string,
): Promise<{ group_code: string; name: string }> {
  const res = await authFetch(`${API_BASE}/api/v1/groups/by-invite/${inviteCode}`, {
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Invalid invite');
  return data;
}

export async function joinGroupByCode(
  inviteCode: string,
): Promise<{ ok: boolean; group_code: string }> {
  const res = await authFetch(`${API_BASE}/api/v1/groups/join-by-code`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ invite_code: inviteCode }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to join');
  return data;
}

export async function joinGroup(groupCode: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/groups/${groupCode}/join`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to join group');
}

export async function getGroupMembers(groupCode: string): Promise<GroupMember[]> {
  const res = await authFetch(`${API_BASE}/api/v1/groups/${groupCode}/members`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch members');
  return res.json();
}

export async function getGroupLeaderboard(groupCode: string): Promise<LeaderboardEntry[]> {
  const res = await authFetch(`${API_BASE}/api/v1/groups/${groupCode}/leaderboard`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch leaderboard');
  return res.json();
}

export async function getGroupActivity(groupCode: string, limit?: number): Promise<ActivityItem[]> {
  const url = `${API_BASE}/api/v1/groups/${groupCode}/activity${limit != null ? `?limit=${limit}` : ''}`;
  const res = await authFetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch activity');
  return res.json();
}

export async function deleteGroup(groupCode: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/groups/${groupCode}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to delete group');
}

export async function leaveGroup(groupCode: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/groups/${groupCode}/leave`, {
    method: 'POST',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to leave group');
}

export async function removeGroupMember(groupCode: string, userCode: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/groups/${groupCode}/members/${userCode}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to remove member');
}

export async function updateMemberRole(
  groupCode: string,
  userCode: string,
  role: 'admin' | 'member',
): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/groups/${groupCode}/members/${userCode}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ role }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to update role');
}

export async function getGroupChecklist(groupCode: string): Promise<ChecklistResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/groups/${groupCode}/checklist`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch checklist');
  return res.json();
}

export async function addPlaceNote(
  groupCode: string,
  placeCode: string,
  text: string,
): Promise<PlaceNote> {
  const res = await authFetch(`${API_BASE}/api/v1/groups/${groupCode}/places/${placeCode}/notes`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to add note');
  return data;
}

export async function deletePlaceNote(groupCode: string, noteCode: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/groups/${groupCode}/notes/${noteCode}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to delete note');
}

export async function addPlaceToGroup(
  groupCode: string,
  placeCode: string,
): Promise<{ ok: boolean; already_exists: boolean }> {
  const res = await authFetch(`${API_BASE}/api/v1/groups/${groupCode}/places/${placeCode}`, {
    method: 'POST',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to add place to group');
  return data;
}

export async function getNotifications(
  limit?: number,
  offset?: number,
): Promise<{ notifications: Notification[]; unread_count: number }> {
  const sp = new URLSearchParams();
  if (limit != null) sp.set('limit', String(limit));
  if (offset != null) sp.set('offset', String(offset));
  const res = await authFetch(`${API_BASE}/api/v1/notifications?${sp}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch notifications');
  return res.json();
}

export async function markNotificationRead(notificationCode: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/notifications/${notificationCode}/read`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to mark read');
}

export async function getSettings(): Promise<UserSettings> {
  const res = await authFetch(`${API_BASE}/api/v1/users/me/settings`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch settings');
  return res.json();
}

export async function updateSettings(settings: UserSettings): Promise<UserSettings> {
  const res = await authFetch(`${API_BASE}/api/v1/users/me/settings`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to update settings');
  return res.json();
}

// ─── Search (Google Places proxy) ─────────────────────────────────────────────

export interface SearchSuggestion {
  place_id: string;
  main_text: string;
  secondary_text: string;
}

export interface SearchPlaceDetails {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export async function searchAutocomplete(
  query: string,
  lat?: number,
  lng?: number,
): Promise<{ suggestions: SearchSuggestion[] }> {
  const sp = new URLSearchParams({ q: query });
  if (lat != null) sp.set('lat', String(lat));
  if (lng != null) sp.set('lng', String(lng));
  const res = await fetch(`${API_BASE}/api/v1/search/autocomplete?${sp}`, {
    headers: clientHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch autocomplete');
  return res.json();
}

export async function getSearchPlaceDetails(placeId: string): Promise<SearchPlaceDetails> {
  const sp = new URLSearchParams({ place_id: placeId });
  const res = await fetch(`${API_BASE}/api/v1/search/place-details?${sp}`, {
    headers: clientHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch place details');
  return res.json();
}

// ─── Visitor API (unauthenticated) ────────────────────────────────────────────

export async function createVisitor(): Promise<{ visitor_code: string; created_at: string }> {
  const res = await fetch(`${API_BASE}/api/v1/visitors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...clientHeaders() },
  });
  if (!res.ok) throw new Error('Failed to create visitor');
  return res.json();
}

export async function getVisitorSettings(code: string): Promise<UserSettings> {
  const res = await fetch(`${API_BASE}/api/v1/visitors/${encodeURIComponent(code)}/settings`, {
    headers: clientHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch visitor settings');
  return res.json();
}

export async function updateVisitorSettings(
  code: string,
  body: Partial<UserSettings>,
): Promise<UserSettings> {
  const res = await fetch(`${API_BASE}/api/v1/visitors/${encodeURIComponent(code)}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...clientHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to update visitor settings');
  return res.json();
}

export async function getCities(params?: {
  limit?: number;
  offset?: number;
  include_images?: boolean;
}): Promise<{
  cities: Array<{ city: string; city_slug: string; count: number; top_images: string[] }>;
  total: number;
}> {
  const q = new URLSearchParams();
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  if (params?.include_images) q.set('include_images', 'true');
  const res = await fetch(`${API_BASE}/api/v1/cities?${q}`, { headers: clientHeaders() });
  if (!res.ok) throw new Error('Failed to fetch cities');
  return res.json();
}

export async function getCityPlaces(citySlug: string, page = 1): Promise<any> {
  const sp = new URLSearchParams({ page: String(page) });
  if (_currentLocale && _currentLocale !== 'en') sp.set('lang', _currentLocale);
  const res = await fetch(`${API_BASE}/api/v1/cities/${encodeURIComponent(citySlug)}?${sp}`, {
    headers: clientHeaders(),
  });
  if (!res.ok) throw new Error('City not found');
  return res.json();
}

export async function getCityReligionPlaces(
  citySlug: string,
  religion: string,
  page = 1,
): Promise<any> {
  const sp = new URLSearchParams({ page: String(page) });
  if (_currentLocale && _currentLocale !== 'en') sp.set('lang', _currentLocale);
  const res = await fetch(
    `${API_BASE}/api/v1/cities/${encodeURIComponent(citySlug)}/${encodeURIComponent(religion)}?${sp}`,
    { headers: clientHeaders() },
  );
  if (!res.ok) throw new Error('City/religion not found');
  return res.json();
}

// ─── Homepage (composite) ─────────────────────────────────────────────────────

export interface HomepageRecommendedPlace {
  place_code: string;
  name: string;
  religion: string;
  address: string;
  city?: string;
  image_url?: string | null;
  distance_km?: number | null;
  lat: number;
  lng: number;
}

export interface HomepagePopularPlace {
  place_code: string;
  name: string;
  religion: string;
  address: string;
  city?: string;
  lat: number;
  lng: number;
  images: { url: string }[];
  average_rating?: number | null;
  review_count?: number | null;
  distance?: number | null;
}

export interface HomepagePopularCity {
  city: string;
  city_slug: string;
  count: number;
  top_images: string[];
}

export interface HomepageFeaturedJourney {
  group_code: string;
  name: string;
  description?: string | null;
  cover_image_url?: string | null;
  is_private: boolean;
  path_place_codes: string[];
  total_sites: number;
  member_count: number;
  created_at: string;
}

export interface HomepageData {
  groups: Group[];
  recommended_places: HomepageRecommendedPlace[];
  featured_journeys: HomepageFeaturedJourney[];
  popular_places: HomepagePopularPlace[];
  popular_cities: HomepagePopularCity[];
  place_count: number;
}

export interface GetHomepageParams {
  lat?: number | null;
  lng?: number | null;
  religions?: string[];
}

export async function getHomepage(params?: GetHomepageParams): Promise<HomepageData> {
  const sp = new URLSearchParams();
  if (params?.lat != null) sp.set('lat', String(params.lat));
  if (params?.lng != null) sp.set('lng', String(params.lng));
  (params?.religions ?? []).forEach((r) => sp.append('religions', r));
  if (_currentLocale && _currentLocale !== 'en') sp.set('lang', _currentLocale);
  const qs = sp.toString();
  const url = `${API_BASE}/api/v1/homepage${qs ? `?${qs}` : ''}`;
  const res = await authFetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch homepage data');
  return res.json();
}
