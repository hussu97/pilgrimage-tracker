export interface User {
  user_code: string;
  email: string;
  display_name: string;
  is_admin: boolean;
  religions: string[];
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  refresh_token: string | null;
}

export interface LoginBody {
  email: string;
  password: string;
}

// Pagination
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

// Users
export interface AdminUser {
  user_code: string;
  email: string;
  display_name: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminUserDetail extends AdminUser {
  check_in_count: number;
  review_count: number;
}

export interface PatchUserBody {
  display_name?: string;
  is_active?: boolean;
  is_admin?: boolean;
}

// Places
export interface AdminPlace {
  place_code: string;
  name: string;
  religion: string;
  place_type: string;
  lat: number;
  lng: number;
  address: string;
  city: string | null;
  state: string | null;
  country: string | null;
  source: string | null;
  created_at: string;
  review_count: number;
  check_in_count: number;
}

export interface AdminPlaceDetail extends AdminPlace {
  description: string | null;
  website_url: string | null;
  opening_hours: Record<string, unknown> | null;
  utc_offset_minutes: number | null;
}

export interface CreatePlaceBody {
  name: string;
  religion: string;
  place_type: string;
  lat: number;
  lng: number;
  address: string;
  description?: string;
  website_url?: string;
  source?: string;
}

export interface PatchPlaceBody {
  name?: string;
  religion?: string;
  place_type?: string;
  lat?: number;
  lng?: number;
  address?: string;
  description?: string;
  website_url?: string;
}

export interface AdminPlaceImage {
  id: number;
  image_type: string;
  url: string | null;
  display_order: number;
  created_at: string;
}

// Reviews
export interface AdminReview {
  review_code: string;
  place_code: string;
  place_name: string | null;
  user_code: string | null;
  user_display_name: string | null;
  rating: number;
  title: string | null;
  is_flagged: boolean;
  source: string;
  review_time: number | null;
  created_at: string;
}

export interface AdminReviewDetail extends AdminReview {
  body: string | null;
  is_anonymous: boolean;
  author_name: string | null;
}

export interface PatchReviewBody {
  title?: string;
  body?: string;
  is_flagged?: boolean;
}

// Check-ins
export interface AdminCheckIn {
  check_in_code: string;
  user_code: string;
  user_display_name: string | null;
  place_code: string;
  place_name: string | null;
  group_code: string | null;
  note: string | null;
  checked_in_at: string;
}

// Groups
export interface AdminGroup {
  group_code: string;
  name: string;
  description: string | null;
  is_private: boolean;
  member_count: number;
  place_count: number;
  created_at: string;
  updated_at: string;
}

export interface AdminGroupDetail extends AdminGroup {
  created_by_user_code: string;
  invite_code: string;
  path_place_codes: string[];
  cover_image_url: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface AdminGroupMember {
  user_code: string;
  display_name: string;
  email: string;
  role: string;
  joined_at: string;
}

export interface AdminGroupMemberListResponse {
  items: AdminGroupMember[];
  total: number;
}

export interface PatchGroupBody {
  name?: string;
  description?: string;
  is_private?: boolean;
}

// ── Scraper ───────────────────────────────────────────────────────────────────

export interface DataLocation {
  code: string;
  name: string;
  source_type: string;
  config: Record<string, unknown>;
  created_at: string;
}

export interface CreateDataLocationBody {
  name: string;
  source_type?: "gmaps";
  country?: string;
  state?: string;
  city?: string;
  max_results?: number;
}

export interface ScraperRun {
  run_code: string;
  location_code: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled" | "interrupted";
  stage: string | null;
  total_items: number | null;
  processed_items: number;
  error_message: string | null;
  created_at: string;
}

export interface ScraperStats {
  total_locations: number;
  total_runs: number;
  total_places_scraped: number;
  last_run_at: string | null;
  last_run_status: string | null;
}

export interface CollectorStatus {
  name: string;
  requires_api_key: boolean;
  is_available: boolean;
  api_key_env_var: string | null;
}

export interface PlaceTypeMapping {
  id: number;
  religion: string;
  source_type: string;
  gmaps_type: string;
  our_place_type: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

export interface CreatePlaceTypeMappingBody {
  religion: string;
  source_type?: "gmaps";
  gmaps_type: string;
  our_place_type: string;
  is_active?: boolean;
  display_order?: number;
}

export interface PatchPlaceTypeMappingBody {
  religion?: string;
  gmaps_type?: string;
  our_place_type?: string;
  is_active?: boolean;
  display_order?: number;
}

export interface ScrapedPlaceData {
  _scraped_id: string;
  _enrichment_status: string;
  _description_source: string | null;
  _description_score: number | null;
  _quality_score: number | null;
  _quality_gate: string | null;
  name: string;
  [key: string]: unknown;
}

export interface RawCollectorEntry {
  place_code: string;
  collector_name: string;
  status: string;
  error_message: string | null;
  raw_response: Record<string, unknown>;
  collected_at: string;
}

export interface RunActivity {
  cells_total: number;
  cells_saturated: number;
  places_total: number;
  places_pending: number;
  places_enriching: { place_code: string; name: string }[];
  places_complete: number;
  places_failed: number;
  places_filtered: number;
  images_downloaded: number;
  images_failed: number;
  places_synced: number;
  places_sync_failed: number;
}

export interface DiscoveryCellItem {
  lat_min: number;
  lat_max: number;
  lng_min: number;
  lng_max: number;
  depth: number;
  radius_m: number;
  result_count: number;
  saturated: boolean;
  resource_names_count: number;
  created_at: string | null;
}

export interface QualityScoreBucket {
  bucket: string;
  count: number;
}

export interface QualityGateCount {
  gate: string;
  count: number;
}

export interface NearThresholdCount {
  gate: string;
  threshold: number;
  count: number;
}

export interface DescriptionSourceCount {
  source: string;
  count: number;
}

export interface EnrichmentStatusCount {
  status: string;
  count: number;
}

export interface PerRunSummaryItem {
  run_code: string;
  location_name: string | null;
  status: string;
  total_scraped: number;
  total_passed: number;
  avg_score: number | null;
  created_at: string;
}

export interface QualityOverallStats {
  total_scraped: number;
  total_synced: number;
  overall_filter_rate_pct: number;
}

export interface QualityMetrics {
  score_distribution: QualityScoreBucket[];
  gate_breakdown: QualityGateCount[];
  near_threshold_counts: NearThresholdCount[];
  avg_quality_score: number | null;
  median_quality_score: number | null;
  description_source_breakdown: DescriptionSourceCount[];
  enrichment_status_breakdown: EnrichmentStatusCount[];
  per_run_summary: PerRunSummaryItem[];
  overall_stats: QualityOverallStats;
}

export interface QualityFactor {
  name: string;
  weight: number;
  raw_score: number;
  weighted: number;
  detail: string;
}

export interface QualityBreakdown {
  total_score: number;
  gate: string | null;
  factors: QualityFactor[];
}

// ── Content & Configuration (Phase 4) ────────────────────────────────────────

// Translations
export interface TranslationEntry {
  key: string;
  /** lang_code -> translated value (null = not set for this lang) */
  values: Record<string, string | null>;
  overridden_langs: string[];
}

export interface Language {
  code: string;
  name: string;
}

export interface UpsertTranslationBody {
  /** Any subset of supported lang codes -> new value */
  values: Record<string, string>;
}

export interface CreateTranslationBody {
  key: string;
  values: Record<string, string>;
}

// App Versions
export interface AppVersionConfig {
  platform: string;
  min_version_hard: string;
  min_version_soft: string;
  latest_version: string;
  store_url: string;
  updated_at: string;
}

export interface UpdateAppVersionBody {
  min_version_hard?: string;
  min_version_soft?: string;
  latest_version?: string;
  store_url?: string;
}

// Content Translations
export interface AdminContentTranslation {
  id: number;
  entity_type: string;
  entity_code: string;
  field: string;
  lang: string;
  translated_text: string;
  source: string;
  created_at: string;
  updated_at: string;
  place_name?: string | null;
}

export interface ContentTranslationListResponse {
  items: AdminContentTranslation[];
  total: number;
  page: number;
  page_size: number;
}

export interface CreateContentTranslationBody {
  entity_type: string;
  entity_code: string;
  field: string;
  lang: string;
  translated_text: string;
  source?: string;
}

export interface UpdateContentTranslationBody {
  translated_text?: string;
  source?: string;
}

// Place Attributes
export interface PlaceAttributeDefinition {
  attribute_code: string;
  name: string;
  data_type: string;
  icon: string | null;
  label_key: string | null;
  is_filterable: boolean;
  is_specification: boolean;
  category: string | null;
  religion: string | null;
  display_order: number;
  usage_count: number;
}

// ── Dashboard Stats (Phase 5) ─────────────────────────────────────────────────

export interface OverviewStats {
  total_users: number;
  total_places: number;
  total_reviews: number;
  total_check_ins: number;
  total_groups: number;
  active_users_30d: number;
}

export interface GrowthDataPoint {
  period: string;
  count: number;
}

export interface PopularPlace {
  place_code: string;
  name: string;
  religion: string;
  check_in_count: number;
  review_count: number;
  avg_rating: number | null;
}

export interface ReligionBreakdownItem {
  religion: string;
  place_count: number;
  check_in_count: number;
}

export interface RecentActivityItem {
  type: "check_in" | "review" | "group_join";
  user_code: string | null;
  user_display_name: string | null;
  place_code: string | null;
  place_name: string | null;
  group_code: string | null;
  group_name: string | null;
  timestamp: string;
}

export interface ReviewStats {
  rating_histogram: Record<string, number>;
  flagged_count: number;
  avg_rating: number | null;
  total_reviews: number;
}

// User check-ins / reviews (for user detail)
export interface AdminUserCheckIn {
  check_in_code: string;
  place_code: string;
  place_name: string | null;
  group_code: string | null;
  note: string | null;
  checked_in_at: string;
}

export interface AdminUserReview {
  review_code: string;
  place_code: string;
  place_name: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  is_flagged: boolean;
  created_at: string;
}

// ── Phase 6 — Bulk Operations ─────────────────────────────────────────────────

export interface BulkResult {
  affected: number;
}

// ── Phase 6 — Audit Log ───────────────────────────────────────────────────────

export interface AuditLogItem {
  log_code: string;
  admin_user_code: string;
  admin_display_name: string | null;
  action: string;
  entity_type: string;
  entity_code: string;
  changes: Record<string, { old: unknown; new: unknown }> | null;
  created_at: string;
}

export interface AuditLogListResponse {
  items: AuditLogItem[];
  total: number;
  page: number;
  page_size: number;
}

// ── Phase 6 — Notifications ───────────────────────────────────────────────────

export interface BroadcastResult {
  broadcast_code: string;
  recipient_count: number;
}

export interface AdminBroadcastItem {
  broadcast_code: string;
  admin_user_code: string;
  admin_display_name: string | null;
  type: string;
  payload: Record<string, unknown>;
  recipient_type: "all" | "targeted";
  recipient_count: number;
  created_at: string;
}

export interface AdminBroadcastListResponse {
  items: AdminBroadcastItem[];
  total: number;
  page: number;
  page_size: number;
}

// ── SEO & Discoverability ─────────────────────────────────────────────────────

export interface SEOStats {
  total_places: number;
  places_with_seo: number;
  places_missing_seo: number;
  places_manually_edited: number;
  coverage_pct: number;
}

export interface SEOListItem {
  place_code: string;
  name: string;
  religion: string;
  place_type: string;
  has_seo: boolean;
  slug: string | null;
  seo_title: string | null;
  meta_description: string | null;
  is_manually_edited: boolean;
  generated_at: string | null;
  updated_at: string | null;
}

export interface SEOListResponse {
  items: SEOListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface SEODetail {
  place_code: string;
  name: string;
  religion: string;
  place_type: string;
  address: string;
  slug: string | null;
  seo_title: string | null;
  meta_description: string | null;
  rich_description: string | null;
  faq_json: FAQItem[] | null;
  og_image_url: string | null;
  is_manually_edited: boolean;
  generated_at: string | null;
  updated_at: string | null;
}

export interface PatchSEOBody {
  slug?: string;
  seo_title?: string;
  meta_description?: string;
  rich_description?: string;
  faq_json?: FAQItem[];
  og_image_url?: string;
  is_manually_edited?: boolean;
}

export interface GenerateResponse {
  generated: number;
  skipped: number;
  errors: number;
}

// Analytics

export interface EventTypeCount {
  event_type: string;
  count: number;
}

export interface PlatformCount {
  platform: string;
  count: number;
}

export interface AnalyticsOverview {
  total_events: number;
  total_events_24h: number;
  total_events_7d: number;
  unique_users: number;
  unique_visitors: number;
  unique_sessions: number;
  top_event_types: EventTypeCount[];
  platform_breakdown: PlatformCount[];
}

export interface AnalyticsTopPlace {
  place_code: string;
  place_name: string;
  religion: string;
  view_count: number;
  interaction_count: number;
}

export interface AnalyticsTrendPoint {
  period: string;
  count: number;
}

export interface AnalyticsEventListItem {
  event_code: string;
  event_type: string;
  user_code: string | null;
  visitor_code: string | null;
  session_id: string;
  properties: Record<string, unknown> | null;
  platform: string;
  device_type: string | null;
  app_version: string | null;
  client_timestamp: string;
  created_at: string;
}

export interface AnalyticsEventListResponse {
  items: AnalyticsEventListItem[];
  total: number;
  page: number;
  page_size: number;
}
