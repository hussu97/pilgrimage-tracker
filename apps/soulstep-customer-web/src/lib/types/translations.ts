export interface LanguageOption {
  code: string;
  name: string;
}

export interface Notification {
  notification_code: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}
