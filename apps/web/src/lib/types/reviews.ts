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
  reviews: Review[];
  average_rating?: number;
  review_count?: number;
}
