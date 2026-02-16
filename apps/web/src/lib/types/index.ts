export type Religion = 'islam' | 'hinduism' | 'christianity';

export interface User {
  user_code: string;
  email: string;
  display_name: string;
  religions: Religion[];
  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Place {
  place_code: string;
  name: string;
  religion: Religion;
  place_type: string;
  lat: number;
  lng: number;
  address: string;
  /**
   * Place images. Each image has a URL and display order.
   * Note: The backend stores images as either external URLs or binary blobs.
   * Blob images are automatically served via /api/v1/places/{code}/images/{id}
   * so all images appear as URLs to the client. Frontend doesn't need to know the storage type.
   */
  images?: Array<{url: string; display_order: number}>;
  distance?: number;
  description?: string;
  opening_hours?: Record<string, string>;
  attributes?: Record<string, unknown>;
  user_has_checked_in?: boolean;
  is_favorite?: boolean;
  /** From API when include_rating=true */
  average_rating?: number;
  review_count?: number;
  is_open_now?: boolean;
}

export interface PlaceTiming {
  name: string;
  time: string;
  is_current: boolean;
  status?: 'past' | 'current' | 'upcoming';
  type?: 'prayer' | 'service' | 'deity';
  subtitle?: string;
  image_url?: string;
}

export interface PlaceSpecification {
  icon: string;
  label: string;
  value: string;
}

export interface PlaceDetail extends Place {
  user_has_checked_in?: boolean;
  is_favorite?: boolean;
  total_checkins_count?: number;
  timings?: PlaceTiming[];
  specifications?: PlaceSpecification[];
  external_reviews?: ExternalReview[];
}

export interface ExternalReview {
  review_code: string;
  place_code: string;
  display_name: string;
  rating: number;
  body?: string;
  created_at: string;
  source: 'external';
}

export interface Review {
  review_code: string;
  place_code: string;
  user_code?: string;
  display_name: string;
  rating: number;
  title?: string;
  body?: string;
  created_at: string;
  source: 'user' | 'external';
}

export interface ReviewsResponse {
  reviews: Review[];
  average_rating?: number;
  review_count?: number;
}

export interface CheckIn {
  check_in_code: string;
  place_code: string;
  checked_in_at: string;
  note?: string;
  photo_url?: string;
  place?: { place_code: string; name: string; address: string; images?: Array<{url: string; display_order: number}> };
  date?: string;
  time?: string;
  place_name?: string;
  place_image_url?: string;
  location?: string;
}

export interface UserStats {
  placesVisited: number;
  checkInsThisYear: number;
  /** Total check-in count (for "Visits" in profile) */
  visits?: number;
  /** Review count (for "Reviews" in profile) */
  reviews?: number;
  /** Badges count (for "Badges" in profile) */
  badges_count?: number;
}

export interface Group {
  group_code: string;
  name: string;
  description: string;
  created_by_user_code: string;
  invite_code: string;
  is_private: boolean;
  created_at: string;
  member_count?: number;
  last_activity?: string | null;
  sites_visited?: number;
  total_sites?: number;
  next_place_code?: string | null;
  next_place_name?: string | null;
  featured?: boolean;
}

export interface GroupMember {
  user_code: string;
  display_name: string;
  role: string;
  joined_at: string;
}

export interface LeaderboardEntry {
  user_code: string;
  display_name: string;
  places_visited: number;
  rank: number;
}

export interface ActivityItem {
  type: string;
  user_code: string;
  display_name: string;
  place_code: string;
  place_name: string;
  checked_in_at: string;
}

export interface Notification {
  notification_code: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface UserSettings {
  notifications_on?: boolean;
  theme?: string;
  units?: string;
  language?: string;
  religions?: Religion[];
}

export interface LanguageOption {
  code: string;
  name: string;
}

export interface FilterOption {
  key: string;
  label: string;
  icon: string;
  count: number;
}

export interface PlacesResponse {
  places: Place[];
  filters?: {
    options: FilterOption[];
  };
}
