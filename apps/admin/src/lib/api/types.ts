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
