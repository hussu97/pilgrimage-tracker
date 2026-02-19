export interface Group {
  group_code: string;
  name: string;
  description: string;
  created_by_user_code: string;
  invite_code: string;
  is_private: boolean;
  path_place_codes: string[];
  cover_image_url?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
  updated_at?: string;
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
  is_creator?: boolean;
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
  note?: string | null;
  photo_url?: string | null;
  group_code?: string | null;
}

export interface PlaceNote {
  note_code: string;
  user_code: string;
  display_name?: string;
  group_code: string;
  place_code: string;
  text: string;
  created_at: string;
}

export interface ChecklistCheckIn {
  user_code: string;
  display_name: string;
  checked_in_at: string;
}

export interface ChecklistPlace {
  place_code: string;
  name: string;
  religion: string | null;
  address: string | null;
  image_url: string | null;
  checked_in_by: ChecklistCheckIn[];
  user_checked_in: boolean;
  check_in_count: number;
  notes: PlaceNote[];
}

export interface ChecklistResponse {
  places: ChecklistPlace[];
  total_places: number;
  group_visited: number;
  personal_visited: number;
  group_progress: number;
  personal_progress: number;
}
