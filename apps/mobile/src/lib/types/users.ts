export type Religion = 'islam' | 'hinduism' | 'christianity';

export interface User {
  user_code: string;
  email: string;
  display_name: string;
  religions: Religion[];
  created_at?: string;
  updated_at?: string;
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

export interface UserSettings {
  notifications_on?: boolean;
  theme?: string;
  units?: string;
  language?: string;
  religions?: Religion[];
}
