'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useParams } from '@/lib/navigation';
import { useHead } from '@/lib/hooks/useHead';
import { useI18n } from '@/app/providers';
import * as api from '@/lib/api/client';
import PlaceCardUnified from '@/components/places/PlaceCardUnified';
import { useUmamiTracking } from '@/lib/hooks/useUmamiTracking';
import { EVENTS } from '@/lib/analytics/events';
import type { Place, Religion } from '@/lib/types';

interface CityMetrics {
  count: number;
  checkins_30d?: number;
  popularity_label?: string | null;
}

const API_BASE = '';
const PAGE_SIZE = 30;

async function getCityMetrics(citySlug: string): Promise<CityMetrics | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/cities?include_metrics=true&page_size=200`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    const cities: Array<{
      city_slug: string;
      count: number;
      checkins_30d?: number;
      popularity_label?: string | null;
    }> = data.items ?? [];
    const match = cities.find((c) => c.city_slug === citySlug);
    if (!match) return null;
    return {
      count: match.count,
      checkins_30d: match.checkins_30d,
      popularity_label: match.popularity_label,
    };
  } catch {
    return null;
  }
}

function PopularityBadge({ label }: { label: string }) {
  const cls =
    label === 'Trending'
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
      : label === 'Popular'
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
        : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}
    >
      {label === 'Trending' && (
        <span className="material-symbols-outlined text-[14px]" aria-hidden>
          local_fire_department
        </span>
      )}
      {label === 'Popular' && (
        <span className="material-symbols-outlined text-[14px]" aria-hidden>
          star
        </span>
      )}
      {label === 'Growing' && (
        <span className="material-symbols-outlined text-[14px]" aria-hidden>
          trending_up
        </span>
      )}
      {label}
    </span>
  );
}

export default function ExploreCity() {
  const { t } = useI18n();
  const { trackUmamiEvent } = useUmamiTracking();
  const { city, religion } = useParams<{ city: string; religion?: Religion }>();
  const [places, setPlaces] = useState<Place[]>([]);
  const [cityName, setCityName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [metrics, setMetrics] = useState<CityMetrics | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);

  useHead({
    title: cityName ? `Sacred Sites in ${cityName}` : 'Explore City',
    description: cityName
      ? `Discover sacred sites, mosques, temples, and churches in ${cityName}.`
      : undefined,
    canonicalUrl: city
      ? `https://soul-step.org/explore/${city}${religion ? `/${religion}` : ''}`
      : undefined,
    ogType: 'website',
  });

  const fetchCityPlaces = useCallback(
    async (page = 1, append = false) => {
      if (!city) return;

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const query = search.trim();
        const params = { page_size: PAGE_SIZE, q: query || undefined };
        const data = religion
          ? await api.getCityReligionPlaces(city, religion, page, params)
          : await api.getCityPlaces(city, page, params);

        if (requestIdRef.current !== requestId) return;
        const nextPlaces = data.items ?? [];
        setPlaces((prev) => (append ? [...prev, ...nextPlaces] : nextPlaces));
        setCityName(data.city ?? '');
        setTotal(data.total ?? 0);
        setCurrentPage(data.page ?? page);
        setHasMore((data.page ?? page) * (data.page_size ?? PAGE_SIZE) < (data.total ?? 0));
      } catch {
        if (requestIdRef.current === requestId && !append) {
          setPlaces([]);
          setTotal(0);
          setHasMore(false);
        }
      } finally {
        if (requestIdRef.current === requestId) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [city, religion, search],
  );

  useEffect(() => {
    setCurrentPage(1);
    setPlaces([]);
    void fetchCityPlaces(1, false);
  }, [fetchCityPlaces]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loading && !loadingMore) {
          void fetchCityPlaces(currentPage + 1, true);
        }
      },
      { rootMargin: '320px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [currentPage, fetchCityPlaces, hasMore, loading, loadingMore]);

  useEffect(() => {
    const maybeLoadNextPage = () => {
      if (!hasMore || loading || loadingMore) return;
      const remaining = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      if (remaining < 1400) {
        void fetchCityPlaces(currentPage + 1, true);
      }
    };

    window.addEventListener('scroll', maybeLoadNextPage, { passive: true });
    maybeLoadNextPage();
    return () => window.removeEventListener('scroll', maybeLoadNextPage);
  }, [currentPage, fetchCityPlaces, hasMore, loading, loadingMore]);

  useEffect(() => {
    if (!city) return;
    getCityMetrics(city).then(setMetrics);
  }, [city]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-4 text-sm text-text-muted dark:text-dark-text-secondary">
        <Link to="/explore" className="hover:text-primary transition-colors">
          {t('explore.allCities')}
        </Link>
        <span>/</span>
        <span className="text-text-main dark:text-white font-medium">{cityName || city}</span>
      </div>

      <h1 className="text-2xl lg:text-3xl font-bold text-text-main dark:text-white mb-2">
        {t('explore.cityTitle').replace('{city}', cityName || city || '')}
      </h1>

      {/* Metrics banner */}
      {metrics && (
        <div className="flex items-center gap-4 mb-6 p-4 rounded-2xl bg-white dark:bg-dark-surface border border-slate-100 dark:border-dark-border shadow-sm flex-wrap">
          <div className="flex flex-col">
            <span className="text-xl font-bold text-text-main dark:text-white tabular-nums">
              {metrics.count.toLocaleString()}
            </span>
            <span className="text-xs text-text-secondary dark:text-dark-text-secondary">
              {t('explore.totalSites') || 'Total sites'}
            </span>
          </div>
          {metrics.checkins_30d != null && (
            <>
              <div className="w-px h-8 bg-slate-100 dark:bg-dark-border" />
              <div className="flex flex-col">
                <span className="text-xl font-bold text-text-main dark:text-white tabular-nums">
                  {metrics.checkins_30d.toLocaleString()}
                </span>
                <span className="text-xs text-text-secondary dark:text-dark-text-secondary">
                  {t('explore.checkins30d') || 'Check-ins (30d)'}
                </span>
              </div>
            </>
          )}
          {metrics.popularity_label && (
            <>
              <div className="w-px h-8 bg-slate-100 dark:bg-dark-border" />
              <PopularityBadge label={metrics.popularity_label} />
            </>
          )}
        </div>
      )}

      <div className="mb-5 rounded-2xl border border-slate-100 bg-white p-2 shadow-sm dark:border-dark-border dark:bg-dark-surface">
        <label htmlFor="city-place-search" className="sr-only">
          {t('explore.placeSearchPlaceholder')}
        </label>
        <div className="flex items-center gap-2 px-2">
          <span className="material-symbols-outlined text-slate-400">search</span>
          <input
            id="city-place-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('explore.placeSearchPlaceholder')}
            className="min-h-12 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted dark:text-white dark:placeholder:text-dark-text-secondary"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-primary dark:hover:bg-dark-bg"
              aria-label={t('common.clear')}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>
      </div>

      {!loading && total > 0 && (
        <p className="mb-4 text-sm text-text-secondary dark:text-dark-text-secondary">
          {t(total === 1 ? 'explore.siteCount' : 'explore.sitesCount').replace(
            '{count}',
            total.toLocaleString(),
          )}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="material-symbols-outlined text-3xl animate-spin text-slate-300">
            progress_activity
          </span>
        </div>
      ) : places.length === 0 ? (
        <p className="text-center text-text-muted dark:text-dark-text-secondary py-12">
          {t('explore.noSites')}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-5">
            {places.map((place) => (
              <PlaceCardUnified
                key={place.place_code}
                place={place}
                t={t}
                onCardClick={(p) =>
                  trackUmamiEvent(EVENTS.discover.place_card_click, {
                    source: 'explore_city',
                    place_code: p.place_code,
                    city,
                    religion,
                  })
                }
              />
            ))}
          </div>

          <div ref={sentinelRef} className="min-h-8 py-4">
            {loadingMore && (
              <div className="flex justify-center">
                <span className="material-symbols-outlined text-2xl animate-spin text-slate-300">
                  progress_activity
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
