export type Religion = 'islam' | 'hinduism' | 'christianity';

export interface User {
  user_code: string;
  email: string;
  display_name: string;
  religion: Religion | null;
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
  image_urls: string[];
  distance?: number;
  description?: string;
  opening_hours?: Record<string, string>;
  religion_specific?: Record<string, unknown>;
  user_has_checked_in?: boolean;
  is_favorite?: boolean;
}

export interface PlaceDetail extends Place {
  religion_specific?: Record<string, unknown>;
  user_has_checked_in?: boolean;
  is_favorite?: boolean;
}

export interface Review {
  review_code: string;
  place_code: string;
  user_code: string;
  display_name: string;
  rating: number;
  title?: string;
  body?: string;
  created_at: string;
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
  place?: { place_code: string; name: string; address: string };
}

export interface UserStats {
  placesVisited: number;
  checkInsThisYear: number;
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
}
