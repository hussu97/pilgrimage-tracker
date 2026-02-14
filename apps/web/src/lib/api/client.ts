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
} from '@/lib/types';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export type { LanguageOption };

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

function getToken(): string | null {
  return localStorage.getItem('token');
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
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
  offset?: number;
}

export async function getPlaces(params?: GetPlacesParams): Promise<Place[]> {
  const sp = new URLSearchParams();
  if (params?.religions?.length) params.religions.forEach((r) => sp.append('religion', r));
  if (params?.lat != null) sp.set('lat', String(params.lat));
  if (params?.lng != null) sp.set('lng', String(params.lng));
  if (params?.radius != null) sp.set('radius', String(params.radius));
  if (params?.place_type) sp.set('place_type', params.place_type);
  if (params?.search) sp.set('search', params.search);
  if (params?.sort) sp.set('sort', params.sort);
  if (params?.limit != null) sp.set('limit', String(params.limit));
  if (params?.offset != null) sp.set('offset', String(params.offset));
  const qs = sp.toString();
  const url = `${API_BASE}/api/v1/places${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch places');
  return res.json();
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

export async function getMe(): Promise<User> {
  const res = await fetch(`${API_BASE}/api/v1/users/me`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to fetch user');
  return data;
}

export async function updateMe(updates: { display_name?: string; avatar_url?: string }): Promise<User> {
  const res = await fetch(`${API_BASE}/api/v1/users/me`, {
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

export async function getPlace(placeCode: string): Promise<PlaceDetail> {
  const res = await fetch(`${API_BASE}/api/v1/places/${placeCode}`, { headers: authHeaders() });
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
    headers: authHeaders(),
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Check-in failed');
  return data;
}

export async function addFavorite(placeCode: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/places/${placeCode}/favorite`, { method: 'POST', headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to add favorite');
}

export async function removeFavorite(placeCode: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/places/${placeCode}/favorite`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to remove favorite');
}

export async function getMyCheckIns(): Promise<CheckIn[]> {
  const res = await fetch(`${API_BASE}/api/v1/users/me/check-ins`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch check-ins');
  const data = await res.json();
  return data;
}

export async function getThisMonthCheckIns(): Promise<CheckIn[]> {
  const res = await fetch(`${API_BASE}/api/v1/users/me/check-ins/this-month`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch this month check-ins');
  return res.json();
}

export async function getOnThisDayCheckIns(): Promise<CheckIn[]> {
  const res = await fetch(`${API_BASE}/api/v1/users/me/check-ins/on-this-day`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch on-this-day check-ins');
  return res.json();
}

export async function getMyStats(): Promise<UserStats> {
  const res = await fetch(`${API_BASE}/api/v1/users/me/stats`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function getMyFavorites(): Promise<Place[]> {
  const res = await fetch(`${API_BASE}/api/v1/users/me/favorites`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch favorites');
  return res.json();
}

export async function createReview(
  placeCode: string,
  body: { rating: number; title?: string; body?: string; is_anonymous?: boolean; photo_urls?: string[] }
): Promise<Review> {
  const res = await fetch(`${API_BASE}/api/v1/places/${placeCode}/reviews`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to submit review');
  return data;
}

export async function updateReview(reviewCode: string, body: { rating?: number; title?: string; body?: string }): Promise<Review> {
  const res = await fetch(`${API_BASE}/api/v1/reviews/${reviewCode}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to update review');
  return data;
}

export async function deleteReview(reviewCode: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/reviews/${reviewCode}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? 'Failed to delete review');
  }
}

export async function getGroups(): Promise<Group[]> {
  const res = await fetch(`${API_BASE}/api/v1/groups`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch groups');
  return res.json();
}

export async function createGroup(body: { name: string; description?: string; is_private?: boolean }): Promise<Group & { invite_code: string }> {
  const res = await fetch(`${API_BASE}/api/v1/groups`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to create group');
  return data;
}

export async function getGroup(groupCode: string): Promise<Group> {
  const res = await fetch(`${API_BASE}/api/v1/groups/${groupCode}`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Group not found');
  return data;
}

export async function getGroupByInviteCode(inviteCode: string): Promise<{ group_code: string; name: string }> {
  const res = await fetch(`${API_BASE}/api/v1/groups/by-invite/${inviteCode}`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Invalid invite');
  return data;
}

export async function joinGroupByCode(inviteCode: string): Promise<{ ok: boolean; group_code: string }> {
  const res = await fetch(`${API_BASE}/api/v1/groups/join-by-code`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ invite_code: inviteCode }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to join');
  return data;
}

export async function joinGroup(groupCode: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/groups/${groupCode}/join`, { method: 'POST', headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to join group');
}

export async function getGroupMembers(groupCode: string): Promise<GroupMember[]> {
  const res = await fetch(`${API_BASE}/api/v1/groups/${groupCode}/members`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch members');
  return res.json();
}

export async function createGroupInvite(groupCode: string): Promise<{ invite_code: string; invite_url: string }> {
  const res = await fetch(`${API_BASE}/api/v1/groups/${groupCode}/invite`, {
    method: 'POST',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Failed to create invite');
  return data;
}

export async function getGroupLeaderboard(groupCode: string): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${API_BASE}/api/v1/groups/${groupCode}/leaderboard`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch leaderboard');
  return res.json();
}

export async function getGroupActivity(groupCode: string, limit?: number): Promise<ActivityItem[]> {
  const url = `${API_BASE}/api/v1/groups/${groupCode}/activity${limit != null ? `?limit=${limit}` : ''}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch activity');
  return res.json();
}

export async function getNotifications(limit?: number, offset?: number): Promise<{ notifications: Notification[]; unread_count: number }> {
  const sp = new URLSearchParams();
  if (limit != null) sp.set('limit', String(limit));
  if (offset != null) sp.set('offset', String(offset));
  const res = await fetch(`${API_BASE}/api/v1/notifications?${sp}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch notifications');
  return res.json();
}

export async function markNotificationRead(notificationCode: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/notifications/${notificationCode}/read`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to mark read');
}

export async function getSettings(): Promise<UserSettings> {
  const res = await fetch(`${API_BASE}/api/v1/users/me/settings`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch settings');
  return res.json();
}

export async function updateSettings(settings: UserSettings): Promise<UserSettings> {
  const res = await fetch(`${API_BASE}/api/v1/users/me/settings`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to update settings');
  return res.json();
}
