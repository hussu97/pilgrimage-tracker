import { apiClient } from "./client";
import type {
  AdminBroadcastListResponse,
  AdminCheckIn,
  AdminContentTranslation,
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
  AppVersionConfig,
  AuditLogListResponse,
  AuthResponse,
  BroadcastResult,
  BulkResult,
  BulkTranslationJob,
  BulkUpsertItem,
  BulkUpsertResult,
  ContentTranslationListResponse,
  CreateContentTranslationBody,
  CreatePlaceBody,
  CreateTranslationBody,
  JobListResponse,
  Language,
  LoginBody,
  PaginatedResponse,
  PatchGroupBody,
  PatchPlaceBody,
  PatchReviewBody,
  PatchUserBody,
  PlaceAttributeDefinition,
  StartJobBody,
  TranslationEntry,
  UntranslatedPlaceItem,
  UpdateAppVersionBody,
  UpdateContentTranslationBody,
  UpsertTranslationBody,
  User,
  SEOStats,
  SEOListResponse,
  SEODetail,
  PatchSEOBody,
  GenerateResponse,
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

export async function refreshToken(): Promise<{ token: string }> {
  const res = await apiClient.post<{ token: string }>("/auth/refresh");
  return res.data;
}

export async function logoutUser(): Promise<void> {
  await apiClient.post("/auth/logout");
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
  city_country?: string;
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

// ── Languages (public — no auth) ──────────────────────────────────────────────

export async function listLanguages(): Promise<Language[]> {
  const res = await apiClient.get<Language[]>("/languages");
  return res.data;
}

// ── Translations ───────────────────────────────────────────────────────────────

export async function listTranslations(params?: {
  search?: string;
}): Promise<TranslationEntry[]> {
  const res = await apiClient.get<TranslationEntry[]>("/admin/translations", { params });
  return res.data;
}

export async function upsertTranslation(
  key: string,
  body: UpsertTranslationBody
): Promise<TranslationEntry> {
  const res = await apiClient.put<TranslationEntry>(`/admin/translations/${key}`, body);
  return res.data;
}

export async function deleteTranslationOverrides(key: string): Promise<void> {
  await apiClient.delete(`/admin/translations/${key}`);
}

export async function createTranslation(body: CreateTranslationBody): Promise<TranslationEntry> {
  const res = await apiClient.post<TranslationEntry>("/admin/translations", body);
  return res.data;
}

// ── App Versions ───────────────────────────────────────────────────────────────

export async function listAppVersions(): Promise<AppVersionConfig[]> {
  const res = await apiClient.get<AppVersionConfig[]>("/admin/app-versions");
  return res.data;
}

export async function updateAppVersion(
  platform: string,
  body: UpdateAppVersionBody
): Promise<AppVersionConfig> {
  const res = await apiClient.put<AppVersionConfig>(`/admin/app-versions/${platform}`, body);
  return res.data;
}

// ── Content Translations ───────────────────────────────────────────────────────

export async function listContentTranslations(params?: {
  page?: number;
  page_size?: number;
  entity_type?: string;
  entity_code?: string;
  lang?: string;
  field?: string;
}): Promise<ContentTranslationListResponse> {
  const res = await apiClient.get<ContentTranslationListResponse>(
    "/admin/content-translations",
    { params }
  );
  return res.data;
}

export async function createContentTranslation(
  body: CreateContentTranslationBody
): Promise<AdminContentTranslation> {
  const res = await apiClient.post<AdminContentTranslation>(
    "/admin/content-translations",
    body
  );
  return res.data;
}

export async function updateContentTranslation(
  id: number,
  body: UpdateContentTranslationBody
): Promise<AdminContentTranslation> {
  const res = await apiClient.put<AdminContentTranslation>(
    `/admin/content-translations/${id}`,
    body
  );
  return res.data;
}

export async function deleteContentTranslation(id: number): Promise<void> {
  await apiClient.delete(`/admin/content-translations/${id}`);
}

// ── Place Attributes ───────────────────────────────────────────────────────────

export async function listPlaceAttributeDefinitions(): Promise<PlaceAttributeDefinition[]> {
  const res = await apiClient.get<PlaceAttributeDefinition[]>("/admin/place-attributes");
  return res.data;
}

// ── Bulk Operations (Phase 6) ─────────────────────────────────────────────────

export async function bulkDeactivateUsers(userCodes: string[]): Promise<BulkResult> {
  const res = await apiClient.post<BulkResult>("/admin/bulk/users/deactivate", { user_codes: userCodes });
  return res.data;
}

export async function bulkActivateUsers(userCodes: string[]): Promise<BulkResult> {
  const res = await apiClient.post<BulkResult>("/admin/bulk/users/activate", { user_codes: userCodes });
  return res.data;
}

export async function bulkFlagReviews(reviewCodes: string[]): Promise<BulkResult> {
  const res = await apiClient.post<BulkResult>("/admin/bulk/reviews/flag", { review_codes: reviewCodes });
  return res.data;
}

export async function bulkUnflagReviews(reviewCodes: string[]): Promise<BulkResult> {
  const res = await apiClient.post<BulkResult>("/admin/bulk/reviews/unflag", { review_codes: reviewCodes });
  return res.data;
}

export async function bulkDeleteReviews(reviewCodes: string[]): Promise<BulkResult> {
  const res = await apiClient.post<BulkResult>("/admin/bulk/reviews/delete", { review_codes: reviewCodes });
  return res.data;
}

export async function bulkDeleteCheckIns(checkInCodes: string[]): Promise<BulkResult> {
  const res = await apiClient.post<BulkResult>("/admin/bulk/check-ins/delete", { check_in_codes: checkInCodes });
  return res.data;
}

export async function bulkDeletePlaces(placeCodes: string[]): Promise<BulkResult> {
  const res = await apiClient.post<BulkResult>("/admin/bulk/places/delete", { place_codes: placeCodes });
  return res.data;
}

export async function bulkDeleteGroups(groupCodes: string[]): Promise<BulkResult> {
  const res = await apiClient.post<BulkResult>("/admin/bulk/groups/delete", { group_codes: groupCodes });
  return res.data;
}

// ── Export (Phase 6) ──────────────────────────────────────────────────────────

export function exportUrl(entity: "users" | "places" | "reviews" | "check-ins" | "groups", format: "csv" | "json"): string {
  const base = apiClient.defaults.baseURL ?? "/api/v1";
  return `${base}/admin/export/${entity}?format=${format}`;
}

// ── Audit Log (Phase 6) ───────────────────────────────────────────────────────

export async function listAuditLog(params?: {
  page?: number;
  page_size?: number;
  admin_user_code?: string;
  entity_type?: string;
  action?: string;
  from_date?: string;
  to_date?: string;
}): Promise<AuditLogListResponse> {
  const res = await apiClient.get<AuditLogListResponse>("/admin/audit-log", { params });
  return res.data;
}

// ── Notifications (Phase 6) ───────────────────────────────────────────────────

export async function broadcastNotification(body: { type: string; payload?: Record<string, unknown> }): Promise<BroadcastResult> {
  const res = await apiClient.post<BroadcastResult>("/admin/notifications/broadcast", body);
  return res.data;
}

export async function sendNotification(body: { user_codes: string[]; type: string; payload?: Record<string, unknown> }): Promise<BroadcastResult> {
  const res = await apiClient.post<BroadcastResult>("/admin/notifications/send", body);
  return res.data;
}

export async function listNotificationHistory(params?: {
  page?: number;
  page_size?: number;
}): Promise<AdminBroadcastListResponse> {
  const res = await apiClient.get<AdminBroadcastListResponse>("/admin/notifications/history", { params });
  return res.data;
}

// ── SEO & Discoverability ─────────────────────────────────────────────────────

export async function getSEOStats(): Promise<SEOStats> {
  const res = await apiClient.get<SEOStats>("/admin/seo/stats");
  return res.data;
}

export async function listSEOPlaces(params?: {
  page?: number;
  page_size?: number;
  religion?: string;
  missing_only?: boolean;
  manually_edited?: boolean;
  search?: string;
}): Promise<SEOListResponse> {
  const res = await apiClient.get<SEOListResponse>("/admin/seo/places", { params });
  return res.data;
}

export async function getSEODetail(placeCode: string): Promise<SEODetail> {
  const res = await apiClient.get<SEODetail>(`/admin/seo/places/${placeCode}`);
  return res.data;
}

export async function patchSEO(placeCode: string, body: PatchSEOBody): Promise<SEODetail> {
  const res = await apiClient.patch<SEODetail>(`/admin/seo/places/${placeCode}`, body);
  return res.data;
}

export async function regenerateSEO(placeCode: string, force = false, translate = false): Promise<SEODetail> {
  const res = await apiClient.post<SEODetail>(
    `/admin/seo/places/${placeCode}/generate`,
    null,
    { params: { force, translate } }
  );
  return res.data;
}

export async function bulkGenerateSEO(body: {
  force?: boolean;
  limit?: number;
  translate?: boolean;
  translate_langs?: string[];
}): Promise<GenerateResponse> {
  const res = await apiClient.post<GenerateResponse>("/admin/seo/generate", body);
  return res.data;
}

// ── Bulk Translation Jobs ─────────────────────────────────────────────────────

export async function startTranslationJob(body: StartJobBody): Promise<BulkTranslationJob> {
  const res = await apiClient.post<BulkTranslationJob>("/admin/translations/jobs", body);
  return res.data;
}

export async function listTranslationJobs(params?: {
  page?: number;
  page_size?: number;
}): Promise<JobListResponse> {
  const res = await apiClient.get<JobListResponse>("/admin/translations/jobs", { params });
  return res.data;
}

export async function getTranslationJob(jobCode: string): Promise<BulkTranslationJob> {
  const res = await apiClient.get<BulkTranslationJob>(`/admin/translations/jobs/${jobCode}`);
  return res.data;
}

export async function cancelTranslationJob(jobCode: string): Promise<BulkTranslationJob> {
  const res = await apiClient.post<BulkTranslationJob>(
    `/admin/translations/jobs/${jobCode}/cancel`
  );
  return res.data;
}

export async function deleteTranslationJob(jobCode: string): Promise<void> {
  await apiClient.delete(`/admin/translations/jobs/${jobCode}`);
}

// ── Claude.ai Manual Translation Workflow ─────────────────────────────────────

export async function exportUntranslated(langs?: string): Promise<UntranslatedPlaceItem[]> {
  const params = langs ? { langs } : {};
  const res = await apiClient.get<UntranslatedPlaceItem[]>(
    "/admin/content-translations/export-untranslated",
    { params }
  );
  return res.data;
}

export async function bulkUpsertTranslations(
  items: BulkUpsertItem[]
): Promise<BulkUpsertResult> {
  const res = await apiClient.post<BulkUpsertResult>(
    "/admin/content-translations/bulk-upsert",
    items
  );
  return res.data;
}
