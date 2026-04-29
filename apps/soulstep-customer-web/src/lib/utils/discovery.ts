import type { Place } from '@/lib/types';
import type { HomepagePopularCity } from '@/lib/api/client';

export const DISCOVERY_JOURNEY_DRAFT_KEY = 'soulstep.discoveryJourneyDraft';

export interface DiscoveryJourneyDraftPlace {
  place_code: string;
  name: string;
  religion: Place['religion'];
  place_type: string;
  lat: number;
  lng: number;
  address: string;
  images?: Place['images'];
}

export interface DiscoveryJourneyDraft {
  source: 'discover';
  places: DiscoveryJourneyDraftPlace[];
  created_at: string;
}

const STREET_WORDS =
  /\b(road|rd|street|st|avenue|ave|lane|ln|drive|dr|highway|hwy|sector|block)\b/i;
const POSTAL_CODE = /\b\d{4,}\b/;

export function isUsefulDiscoveryCity(city: string | null | undefined): boolean {
  const value = (city ?? '').trim();
  if (!value) return false;
  if (/^unnamed\b/i.test(value)) return false;
  if (value.length < 3 || value.length > 48) return false;
  if (POSTAL_CODE.test(value)) return false;
  if (STREET_WORDS.test(value)) return false;
  if (value.includes(',')) return false;
  return true;
}

export function filterDiscoveryCities(
  cities: HomepagePopularCity[],
  limit = 8,
): HomepagePopularCity[] {
  const seen = new Set<string>();
  return cities
    .filter((city) => isUsefulDiscoveryCity(city.city))
    .filter((city) => {
      const key = city.city.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function buildDiscoveryJourneyDraft(places: Place[]): DiscoveryJourneyDraft {
  return {
    source: 'discover',
    created_at: new Date().toISOString(),
    places: places.map((place) => ({
      place_code: place.place_code,
      name: place.name,
      religion: place.religion,
      place_type: place.place_type,
      lat: place.lat,
      lng: place.lng,
      address: place.address,
      images: place.images,
    })),
  };
}

export function parseDiscoveryJourneyDraft(raw: string | null): DiscoveryJourneyDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DiscoveryJourneyDraft;
    if (parsed?.source !== 'discover' || !Array.isArray(parsed.places)) return null;
    return parsed;
  } catch {
    return null;
  }
}
