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
  images?: { url: string }[];
}

export interface ReviewsResponse {
  items: Review[];
  total: number;
  page: number;
  page_size: number;
  average_rating?: number;
}
