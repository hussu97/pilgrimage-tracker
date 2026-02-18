/**
 * API client for Pilgrimage Tracker. Uses EXPO_PUBLIC_API_URL for base URL.
 * When unset, defaults to 127.0.0.1:3000 so the simulator can reach the backend.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { TOKEN_KEY } from '@/lib/constants';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:3000';

export type { LanguageOption };

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// i18n
export async function getLanguages(): Promise<LanguageOption[]> {
  const res = await fetch(`${API_BASE}/api/v1/languages`);
  if (!res.ok) throw new Error('Failed to fetch languages');
  return res.json();
}

export async function getTranslations(lang: string): Promise<Record<string, string>> {
  const res = await fetch(`${API_BASE}/api/v1/translations?lang=${encodeURIComponent(lang)}`);
  if (!res.ok) throw new Error('Failed to fetch translations');
  return res.json();
}

// Auth
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Registration failed');
  return data;
}

export async function login(body: LoginBody): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Login failed');
  return data;
}

export async function forgotPassword(email: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/v1/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

export async function resetPassword(token: string, newPassword: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/api/v1/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Reset failed');
  return data;
}

// Users
export async function getMe(): Promise<User> {
  const res = await fetch(`${API_BASE}/api/v1/users/me`, { headers: await authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to fetch user');
  return data;
}

export async function updateMe(updates: { display_name?: string }): Promise<User> {
  const res = await fetch(`${API_BASE}/api/v1/users/me`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Update failed');
  return data;
}

export async function getMyCheckIns(): Promise<CheckIn[]> {
  const res = await fetch(`${API_BASE}/api/v1/users/me/check-ins`, { headers: await authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch check-ins');
  const data = await res.json();
  return data;
}

export async function getThisMonthCheckIns(): Promise<CheckIn[]> {
  const res = await fetch(`${API_BASE}/api/v1/users/me/check-ins/this-month`, { headers: await authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch this month check-ins');
  return res.json();
}

export async function getOnThisDayCheckIns(): Promise<CheckIn[]> {
  const res = await fetch(`${API_BASE}/api/v1/users/me/check-ins/on-this-day`, { headers: await authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch on-this-day check-ins');
  return res.json();
}

export async function getMyStats(): Promise<UserStats> {
  const res = await fetch(`${API_BASE}/api/v1/users/me/stats`, { headers: await authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function getMyFavorites(): Promise<Place[]> {
  const res = await fetch(`${API_BASE}/api/v1/users/me/favorites`, { headers: await authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch favorites');
  return res.json();
}

export async function getSettings(): Promise<UserSettings> {
  const res = await fetch(`${API_BASE}/api/v1/users/me/settings`, { headers: await authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch settings');
  return res.json();
}

export async function updateSettings(settings: UserSettings): Promise<UserSettings> {
  const res = await fetch(`${API_BASE}/api/v1/users/me/settings`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to update settings');
  return res.json();
}

// Places
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
  const qs = sp.toString();
  const url = `${API_BASE}/api/v1/places${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers: await authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch places');
  const data = await res.json();
  return { ...data, next_cursor: data.next_cursor ?? null };
}

export async function getPlace(placeCode: string): Promise<PlaceDetail> {
  const res = await fetch(`${API_BASE}/api/v1/places/${placeCode}`, { headers: await authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Place not found');
  return data;
}

export async function getPlaceReviews(placeCode: string, limit = 5): Promise<ReviewsResponse> {
  const res = await fetch(`${API_BASE}/api/v1/places/${placeCode}/reviews?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch reviews');
  return res.json();
}

export async function checkIn(placeCode: string, body?: { note?: string; photo_url?: string }): Promise<CheckIn> {
  const res = await fetch(`${API_BASE}/api/v1/places/${placeCode}/check-in`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Check-in failed');
  return data;
}

export async function addFavorite(placeCode: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/places/${placeCode}/favorite`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to add favorite');
}

export async function removeFavorite(placeCode: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/places/${placeCode}/favorite`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to remove favorite');
}

export async function uploadReviewPhoto(uri: string): Promise<{
  id: number;
  url: string;
  width: number;
  height: number;
}> {
  const formData = new FormData();

  // Create file object for React Native
  formData.append('file', {
    uri,
    type: 'image/jpeg',
    name: 'photo.jpg',
  } as any);

  const token = await getToken();
  const res = await fetch(`${API_BASE}/api/v1/reviews/upload-photo`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Don't set Content-Type - FormData will set it with boundary
    },
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to upload photo');
  return data;
}

export async function createReview(
  placeCode: string,
  body: { rating: number; title?: string; body?: string; is_anonymous?: boolean; photo_urls?: string[] }
): Promise<Review> {
  const res = await fetch(`${API_BASE}/api/v1/places/${placeCode}/reviews`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to submit review');
  return data;
}

// Reviews
export async function updateReview(
  reviewCode: string,
  body: { rating?: number; title?: string; body?: string }
): Promise<Review> {
  const res = await fetch(`${API_BASE}/api/v1/reviews/${reviewCode}`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to update review');
  return data;
}

export async function deleteReview(reviewCode: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/reviews/${reviewCode}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail ?? 'Failed to delete review');
  }
}

// Groups
export async function getGroups(): Promise<Group[]> {
  const res = await fetch(`${API_BASE}/api/v1/groups`, { headers: await authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch groups');
  return res.json();
}

export async function createGroup(body: {
  name: string;
  description?: string;
  is_private?: boolean;
}): Promise<Group & { invite_code: string }> {
  const res = await fetch(`${API_BASE}/api/v1/groups`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to create group');
  return data;
}

export async function getGroup(groupCode: string): Promise<Group> {
  const res = await fetch(`${API_BASE}/api/v1/groups/${groupCode}`, { headers: await authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Group not found');
  return data;
}

export async function getGroupByInviteCode(inviteCode: string): Promise<{ group_code: string; name: string }> {
  const res = await fetch(`${API_BASE}/api/v1/groups/by-invite/${inviteCode}`, {
    headers: await authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Invalid invite');
  return data;
}

export async function joinGroupByCode(inviteCode: string): Promise<{ ok: boolean; group_code: string }> {
  const res = await fetch(`${API_BASE}/api/v1/groups/join-by-code`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ invite_code: inviteCode }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to join');
  return data;
}

export async function joinGroup(groupCode: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/groups/${groupCode}/join`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to join group');
}

export async function getGroupMembers(groupCode: string): Promise<GroupMember[]> {
  const res = await fetch(`${API_BASE}/api/v1/groups/${groupCode}/members`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch members');
  return res.json();
}

export async function createGroupInvite(
  groupCode: string
): Promise<{ invite_code: string; invite_url: string }> {
  const res = await fetch(`${API_BASE}/api/v1/groups/${groupCode}/invite`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to create invite');
  return data;
}

export async function getGroupLeaderboard(groupCode: string): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${API_BASE}/api/v1/groups/${groupCode}/leaderboard`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch leaderboard');
  return res.json();
}

export async function getGroupActivity(groupCode: string, limit?: number): Promise<ActivityItem[]> {
  const url = `${API_BASE}/api/v1/groups/${groupCode}/activity${limit != null ? `?limit=${limit}` : ''}`;
  const res = await fetch(url, { headers: await authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch activity');
  return res.json();
}

// Notifications
export async function getNotifications(
  limit?: number,
  offset?: number
): Promise<{ notifications: Notification[]; unread_count: number }> {
  const sp = new URLSearchParams();
  if (limit != null) sp.set('limit', String(limit));
  if (offset != null) sp.set('offset', String(offset));
  const res = await fetch(`${API_BASE}/api/v1/notifications?${sp}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch notifications');
  return res.json();
}

export async function markNotificationRead(notificationCode: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/notifications/${notificationCode}/read`, {
    method: 'PATCH',
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to mark read');
}

// ─── Visitor API (unauthenticated) ────────────────────────────────────────────

export async function createVisitor(): Promise<{ visitor_code: string; created_at: string }> {
  const res = await fetch(`${API_BASE}/api/v1/visitors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to create visitor');
  return res.json();
}

export async function getVisitorSettings(code: string): Promise<UserSettings> {
  const res = await fetch(`${API_BASE}/api/v1/visitors/${encodeURIComponent(code)}/settings`);
  if (!res.ok) throw new Error('Failed to fetch visitor settings');
  return res.json();
}

export async function updateVisitorSettings(code: string, body: Partial<UserSettings>): Promise<UserSettings> {
  const res = await fetch(`${API_BASE}/api/v1/visitors/${encodeURIComponent(code)}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to update visitor settings');
  return res.json();
}
