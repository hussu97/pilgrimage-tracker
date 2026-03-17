export interface Review {
  review_code: string;
  place_code: string;
  user_code?: string;
  display_name: string;
  rating: number;
  title?: string;
  body?: string;
  photo_urls?: string[];
  images?: { url: string }[];
  created_at: string;
  source: 'user' | 'external';
}

export interface ReviewsResponse {
  items: Review[];
  total: number;
  average_rating?: number;
}
