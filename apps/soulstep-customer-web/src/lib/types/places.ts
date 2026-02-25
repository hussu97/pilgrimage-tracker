import type { Religion } from './users';

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
  images?: Array<{ url: string; display_order: number }>;
  distance?: number;
  description?: string;
  opening_hours?: Record<string, string>;
  utc_offset_minutes?: number;
  opening_hours_today?: string;
  attributes?: Record<string, unknown>;
  user_has_checked_in?: boolean;
  is_favorite?: boolean;
  /** From API when include_rating=true */
  average_rating?: number;
  review_count?: number;
  is_open_now?: boolean | null;
  open_status?: 'open' | 'closed' | 'unknown';
  /** From API when include_checkins=true on list endpoint */
  total_checkins_count?: number;
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
  seo_slug?: string;
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

export interface CheckIn {
  check_in_code: string;
  place_code: string;
  checked_in_at: string;
  note?: string;
  photo_url?: string;
  place?: {
    place_code: string;
    name: string;
    address: string;
    images?: Array<{ url: string; display_order: number }>;
    average_rating?: number;
  };
  date?: string;
  time?: string;
  place_name?: string;
  place_image_url?: string;
  location?: string;
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
  next_cursor?: string | null;
}
