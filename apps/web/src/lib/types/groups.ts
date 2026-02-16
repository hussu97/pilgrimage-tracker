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
