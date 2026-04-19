// Server-only fetch module.
// DO NOT import this file in 'use client' components — it uses absolute URLs
// and is intended solely for generateMetadata() and Server Component data fetching.
//
// URL resolution priority:
//   INTERNAL_API_URL (private, server-only, e.g. Cloud Run internal URL)
//   → NEXT_PUBLIC_API_BASE_URL (public domain, set at build time)
//   → 'https://catalog-api.soul-step.org' (hard fallback)

import type { BlogPostDetail, BlogPostSummary } from '@/lib/types/blog';

const INTERNAL_BASE =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://catalog-api.soul-step.org';

async function serverFetch<T>(path: string, revalidate = 3600): Promise<T> {
  const url = `${INTERNAL_BASE}${path}`;
  const res = await fetch(url, { next: { revalidate } });
  if (!res.ok) {
    throw new Error(`Server fetch failed: ${res.status} ${url}`);
  }
  return res.json() as Promise<T>;
}

// ── Blog ─────────────────────────────────────────────────────────────────────

export async function fetchBlogPost(slug: string): Promise<BlogPostDetail> {
  return serverFetch<BlogPostDetail>(`/api/v1/blog/posts/${encodeURIComponent(slug)}`, 3600);
}

export async function fetchBlogPosts(): Promise<BlogPostSummary[]> {
  return serverFetch<BlogPostSummary[]>('/api/v1/blog/posts', 300);
}

// ── Places ────────────────────────────────────────────────────────────────────

export interface PlaceForMeta {
  place_code: string;
  name: string;
  seo_title?: string | null;
  seo_meta_description?: string | null;
  seo_og_image_url?: string | null;
  seo_slug?: string | null;
  seo_faq_json?: Array<{ question: string; answer: string }> | null;
  religion?: string;
  place_type?: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  country_iso_code?: string | null;
  lat?: number | null;
  lng?: number | null;
  images?: Array<{ url: string; alt_text?: string | null }>;
  average_rating?: number | null;
  review_count?: number | null;
  description?: string | null;
}

export async function fetchPlace(placeCode: string): Promise<PlaceForMeta> {
  return serverFetch<PlaceForMeta>(`/api/v1/places/${encodeURIComponent(placeCode)}`, 3600);
}

// ── Cities ────────────────────────────────────────────────────────────────────

export interface CityMeta {
  city: string;
  city_slug: string;
  total_count: number;
  religion_counts?: Record<string, number>;
}

export async function fetchCityMeta(citySlug: string): Promise<CityMeta> {
  return serverFetch<CityMeta>(`/api/v1/cities/${encodeURIComponent(citySlug)}`, 3600);
}
