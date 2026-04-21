'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from '@/lib/navigation';
import { useHead } from '@/lib/hooks/useHead';
import { useI18n } from '@/app/providers';
import * as api from '@/lib/api/client';
import { useUmamiTracking } from '@/lib/hooks/useUmamiTracking';
import { EVENTS } from '@/lib/analytics/events';

const PAGE_SIZE = 24;

interface City {
  city: string;
  city_slug: string;
  count: number;
  top_images: string[];
  translations?: Record<string, string>;
}

function CityCollageCard({ city }: { city: City }) {
  const { t, locale } = useI18n();
  const { trackUmamiEvent } = useUmamiTracking();
  const images = city.top_images ?? [];

  return (
    <Link
      to={`/explore/${city.city_slug}`}
      onClick={() =>
        trackUmamiEvent(EVENTS.discover.city_click, {
          city: city.city,
          count: city.count,
        })
      }
      className="group relative rounded-2xl overflow-hidden h-48 cursor-pointer block shadow-sm hover:shadow-2xl hover:ring-2 hover:ring-primary/30 transition-all duration-300"
    >
      {/* Image collage */}
      {images.length === 0 ? (
        <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center">
          <span className="material-icons text-5xl text-white/60">location_city</span>
        </div>
      ) : images.length === 1 ? (
        <img
          src={images[0]}
          alt={city.city}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
      ) : images.length === 2 ? (
        <div className="flex h-full gap-0.5">
          <img
            src={images[0]}
            alt=""
            className="w-1/2 h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
          <img
            src={images[1]}
            alt=""
            className="w-1/2 h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        </div>
      ) : (
        <div className="flex h-full gap-0.5">
          <img
            src={images[0]}
            alt=""
            className="w-1/2 h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
          <div className="w-1/2 flex flex-col gap-0.5">
            <img
              src={images[1]}
              alt=""
              className="h-1/2 w-full object-cover group-hover:scale-110 transition-transform duration-500"
            />
            <img
              src={images[2]}
              alt=""
              className="h-1/2 w-full object-cover group-hover:scale-110 transition-transform duration-500"
            />
          </div>
        </div>
      )}

      {/* Dark gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      {/* Text content */}
      <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-1 group-hover:translate-y-0 transition-transform duration-200">
        <p className="text-sm font-bold text-white leading-tight line-clamp-1">
          {city.translations?.[locale] || city.city}
        </p>
        <p className="text-xs text-white/70 mt-0.5">
          {t(city.count === 1 ? 'explore.siteCount' : 'explore.sitesCount').replace(
            '{count}',
            String(city.count),
          )}
        </p>
      </div>
    </Link>
  );
}

export default function ExploreCities() {
  const { t } = useI18n();
  useHead({
    title: 'Explore Sacred Sites by City',
    description:
      'Discover sacred sites in cities around the world. Find mosques, temples, churches, and more by city.',
    canonicalUrl: 'https://soul-step.org/explore',
    ogType: 'website',
    ogTitle: 'Explore Sacred Sites by City | SoulStep',
    ogUrl: 'https://soul-step.org/explore',
    twitterCard: 'summary',
  });

  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchCities = useCallback(async (page: number, append: boolean) => {
    if (page === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const data = await api.getCities({
        page,
        page_size: PAGE_SIZE,
        include_images: true,
      });
      const fetched = data.items ?? [];
      setCities((prev) => (append ? [...prev, ...fetched] : fetched));
      setCurrentPage(page);
      setHasMore(page * PAGE_SIZE < (data.total ?? 0));
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchCities(1, false);
  }, [fetchCities]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          fetchCities(currentPage + 1, true);
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, currentPage, fetchCities]);

  const filtered = cities.filter((c) => c.city.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl lg:text-3xl font-bold text-text-main dark:text-white mb-2">
        {t('explore.title')}
      </h1>
      <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-6">
        {t('explore.subtitle')}
      </p>

      <input
        type="search"
        placeholder={t('explore.searchPlaceholder')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-2.5 rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface text-sm text-text-main dark:text-white placeholder-text-muted dark:placeholder-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-primary mb-6"
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="material-symbols-outlined text-3xl animate-spin text-slate-300">
            progress_activity
          </span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((city) => (
              <CityCollageCard key={city.city_slug} city={city} />
            ))}
          </div>

          {!loading && filtered.length === 0 && (
            <p className="text-center text-text-muted dark:text-dark-text-secondary py-8">
              {t('explore.noCities')}
            </p>
          )}

          {/* Infinite scroll sentinel (only when not filtering) */}
          {!search && (
            <div ref={sentinelRef} className="h-4 mt-4">
              {loadingMore && (
                <div className="flex justify-center py-4">
                  <span className="material-symbols-outlined text-2xl animate-spin text-slate-300">
                    progress_activity
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
