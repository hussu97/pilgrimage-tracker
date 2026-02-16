/**
 * Image utility functions for handling place and review images.
 */

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:3000';

/**
 * Convert a potentially relative image URL to a full URL.
 *
 * - Blob images from the backend come as relative URLs (e.g., /api/v1/places/{code}/images/{id})
 * - External images are already full URLs (e.g., https://images.unsplash.com/...)
 *
 * @param url - The image URL (relative or absolute)
 * @returns Full URL with API_BASE prepended for relative URLs, or original URL for external images
 */
export function getFullImageUrl(url?: string): string {
  if (!url) return '';
  // If it's a relative URL (blob image), prepend API_BASE
  if (url.startsWith('/')) return `${API_BASE}${url}`;
  // Otherwise it's an external URL, return as-is
  return url;
}
