import { apiClient } from "./client";
import type {
  AdminCheckIn,
  AdminGroup,
  AdminGroupDetail,

  AdminGroupMemberListResponse,
  AdminPlace,
  AdminPlaceDetail,
  AdminPlaceImage,
  AdminReview,
  AdminReviewDetail,
  AdminUser,
  AdminUserCheckIn,
  AdminUserDetail,
  AdminUserReview,
  AuthResponse,
  CreatePlaceBody,
  LoginBody,
  PaginatedResponse,
  PatchGroupBody,
  PatchPlaceBody,
  PatchReviewBody,
  PatchUserBody,
  User,
} from "./types";

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(body: LoginBody): Promise<AuthResponse> {
  const res = await apiClient.post<AuthResponse>("/auth/login", body);
  return res.data;
}

export async function getMe(): Promise<User> {
  const res = await apiClient.get<User>("/users/me");
  return res.data;
}

// ── Users ─────────────────────────────────────────────────────────────────────

export async function listUsers(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  is_active?: boolean;
  is_admin?: boolean;
}): Promise<PaginatedResponse<AdminUser>> {
  const res = await apiClient.get<PaginatedResponse<AdminUser>>("/admin/users", { params });
  return res.data;
}

export async function getUser(userCode: string): Promise<AdminUserDetail> {
  const res = await apiClient.get<AdminUserDetail>(`/admin/users/${userCode}`);
  return res.data;
}

export async function patchUser(userCode: string, body: PatchUserBody): Promise<AdminUserDetail> {
  const res = await apiClient.patch<AdminUserDetail>(`/admin/users/${userCode}`, body);
  return res.data;
}

export async function deactivateUser(userCode: string): Promise<void> {
  await apiClient.delete(`/admin/users/${userCode}`);
}

export async function listUserCheckIns(
  userCode: string,
  params?: { page?: number; page_size?: number }
): Promise<PaginatedResponse<AdminUserCheckIn>> {
  const res = await apiClient.get<PaginatedResponse<AdminUserCheckIn>>(
    `/admin/users/${userCode}/check-ins`,
    { params }
  );
  return res.data;
}

export async function listUserReviews(
  userCode: string,
  params?: { page?: number; page_size?: number }
): Promise<PaginatedResponse<AdminUserReview>> {
  const res = await apiClient.get<PaginatedResponse<AdminUserReview>>(
    `/admin/users/${userCode}/reviews`,
    { params }
  );
  return res.data;
}

// ── Places ────────────────────────────────────────────────────────────────────

export async function listPlaces(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  religion?: string;
  place_type?: string;
}): Promise<PaginatedResponse<AdminPlace>> {
  const res = await apiClient.get<PaginatedResponse<AdminPlace>>("/admin/places", { params });
  return res.data;
}

export async function getPlace(placeCode: string): Promise<AdminPlaceDetail> {
  const res = await apiClient.get<AdminPlaceDetail>(`/admin/places/${placeCode}`);
  return res.data;
}

export async function createPlace(body: CreatePlaceBody): Promise<AdminPlaceDetail> {
  const res = await apiClient.post<AdminPlaceDetail>("/admin/places", body);
  return res.data;
}

export async function patchPlace(
  placeCode: string,
  body: PatchPlaceBody
): Promise<AdminPlaceDetail> {
  const res = await apiClient.patch<AdminPlaceDetail>(`/admin/places/${placeCode}`, body);
  return res.data;
}

export async function deletePlace(placeCode: string): Promise<void> {
  await apiClient.delete(`/admin/places/${placeCode}`);
}

export async function listPlaceImages(placeCode: string): Promise<AdminPlaceImage[]> {
  const res = await apiClient.get<AdminPlaceImage[]>(`/admin/places/${placeCode}/images`);
  return res.data;
}

export async function deletePlaceImage(placeCode: string, imageId: number): Promise<void> {
  await apiClient.delete(`/admin/places/${placeCode}/images/${imageId}`);
}

// ── Reviews ───────────────────────────────────────────────────────────────────

export async function listReviews(params?: {
  page?: number;
  page_size?: number;
  is_flagged?: boolean;
  place_code?: string;
  user_code?: string;
  min_rating?: number;
  max_rating?: number;
}): Promise<PaginatedResponse<AdminReview>> {
  const res = await apiClient.get<PaginatedResponse<AdminReview>>("/admin/reviews", { params });
  return res.data;
}

export async function getReview(reviewCode: string): Promise<AdminReviewDetail> {
  const res = await apiClient.get<AdminReviewDetail>(`/admin/reviews/${reviewCode}`);
  return res.data;
}

export async function patchReview(
  reviewCode: string,
  body: PatchReviewBody
): Promise<AdminReviewDetail> {
  const res = await apiClient.patch<AdminReviewDetail>(`/admin/reviews/${reviewCode}`, body);
  return res.data;
}

export async function deleteReview(reviewCode: string): Promise<void> {
  await apiClient.delete(`/admin/reviews/${reviewCode}`);
}

// ── Check-ins ─────────────────────────────────────────────────────────────────

export async function listCheckIns(params?: {
  page?: number;
  page_size?: number;
  place_code?: string;
  user_code?: string;
  group_code?: string;
  from_date?: string;
  to_date?: string;
}): Promise<PaginatedResponse<AdminCheckIn>> {
  const res = await apiClient.get<PaginatedResponse<AdminCheckIn>>("/admin/check-ins", { params });
  return res.data;
}

export async function deleteCheckIn(checkInCode: string): Promise<void> {
  await apiClient.delete(`/admin/check-ins/${checkInCode}`);
}

// ── Groups ────────────────────────────────────────────────────────────────────

export async function listGroups(params?: {
  page?: number;
  page_size?: number;
  search?: string;
}): Promise<PaginatedResponse<AdminGroup>> {
  const res = await apiClient.get<PaginatedResponse<AdminGroup>>("/admin/groups", { params });
  return res.data;
}

export async function getGroup(groupCode: string): Promise<AdminGroupDetail> {
  const res = await apiClient.get<AdminGroupDetail>(`/admin/groups/${groupCode}`);
  return res.data;
}

export async function patchGroup(
  groupCode: string,
  body: PatchGroupBody
): Promise<AdminGroupDetail> {
  const res = await apiClient.patch<AdminGroupDetail>(`/admin/groups/${groupCode}`, body);
  return res.data;
}

export async function deleteGroup(groupCode: string): Promise<void> {
  await apiClient.delete(`/admin/groups/${groupCode}`);
}

export async function listGroupMembers(groupCode: string): Promise<AdminGroupMemberListResponse> {
  const res = await apiClient.get<AdminGroupMemberListResponse>(
    `/admin/groups/${groupCode}/members`
  );
  return res.data;
}

export async function removeGroupMember(groupCode: string, userCode: string): Promise<void> {
  await apiClient.delete(`/admin/groups/${groupCode}/members/${userCode}`);
}
