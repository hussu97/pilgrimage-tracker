export interface ArticleSection {
  heading?: string;
  paragraphs: string[];
}

export interface BlogPostSummary {
  post_code: string;
  slug: string;
  title: string;
  description: string;
  published_at: string; // ISO-8601
  updated_at: string;
  reading_time: number;
  category: string;
  cover_gradient: string;
  // SEO / GEO fields (backend B3)
  author_name?: string | null;
  tags?: string[];
  word_count?: number;
  cover_image_url?: string | null;
}

export interface BlogPostDetail extends BlogPostSummary {
  content: ArticleSection[];
  faq_json?: Array<{ question: string; answer: string }> | null;
}
