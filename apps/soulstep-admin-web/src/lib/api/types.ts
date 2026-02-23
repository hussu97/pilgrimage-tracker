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
  city?: string;
  max_results?: number;
}

export interface ScraperRun {
  run_code: string;
  location_code: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  total_items: number | null;
  processed_items: number;
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
