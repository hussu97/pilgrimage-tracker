import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/app/providers';
import { useHead } from '@/lib/hooks/useHead';
import { getPlaces } from '@/lib/api/client';
import type { Place } from '@/lib/types';
import { getFullImageUrl } from '@/lib/utils/imageUtils';

const RELIGIONS = [
  { value: '', labelKey: 'common.all' },
  { value: 'islam', labelKey: 'common.islam' },
  { value: 'christianity', labelKey: 'common.christianity' },
  { value: 'hinduism', labelKey: 'common.hinduism' },
  { value: 'buddhism', labelKey: 'common.buddhism' },
  { value: 'sikhism', labelKey: 'common.sikhism' },
  { value: 'judaism', labelKey: 'common.judaism' },
  { value: 'bahai', labelKey: 'common.bahai' },
  { value: 'zoroastrianism', labelKey: 'common.zoroastrianism' },
];

export default function Places() {
  useHead({
    title: 'All Sacred Sites',
    description:
      'Browse all mosques, temples, churches, synagogues, and sacred places worldwide on SoulStep.',
    canonicalUrl: 'https://soul-step.org/places',
    ogType: 'website',
    ogTitle: 'All Sacred Sites | SoulStep',
    ogDescription: 'Browse all sacred sites worldwide — mosques, temples, churches, and more.',
    ogUrl: 'https://soul-step.org/places',
    twitterCard: 'summary',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'All Sacred Sites | SoulStep',
        description: 'Browse all sacred sites worldwide on SoulStep',
        url: 'https://soul-step.org/places',
      },
    ],
  });

  const { t } = useI18n();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [religion, setReligion] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const fetchPlaces = useCallback(
    async (nextCursor: string | null = null, reset = false) => {
      setLoading(true);
      try {
        const resp = await getPlaces({
          religions: religion ? [religion as any] : undefined,
          limit: 50,
          cursor: nextCursor ?? undefined,
        });
        if (reset) {
          setPlaces(resp.places);
        } else {
          setPlaces((prev) => [...prev, ...resp.places]);
        }
        setCursor(resp.next_cursor ?? null);
        setHasMore(resp.next_cursor != null);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    },
    [religion],
  );

  useEffect(() => {
    setCursor(null);
    fetchPlaces(null, true);
  }, [religion, fetchPlaces]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-main dark:text-white mb-1">All Sacred Sites</h1>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
          Browse mosques, temples, churches, and places of worship worldwide.
        </p>
      </div>

      {/* Religion filter */}
      <div className="flex gap-2 flex-wrap mb-6">
        {RELIGIONS.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => setReligion(r.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              religion === r.value
                ? 'bg-primary text-white'
                : 'bg-slate-100 dark:bg-dark-surface text-text-secondary dark:text-dark-text-secondary hover:bg-slate-200 dark:hover:bg-dark-border'
            }`}
          >
            {t(r.labelKey)}
          </button>
        ))}
      </div>

      {loading && places.length === 0 ? (
        <div className="flex justify-center py-12">
          <span className="material-symbols-outlined text-3xl animate-spin text-slate-300">
            progress_activity
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {places.map((place) => {
            const imgUrl = place.images?.[0]?.url ? getFullImageUrl(place.images[0].url) : null;
            const altText = place.images?.[0]?.alt_text || place.name;
            const to = `/places/${place.place_code}`;

            return (
              <Link
                key={place.place_code}
                to={to}
                className="rounded-2xl overflow-hidden bg-white dark:bg-dark-surface border border-slate-100 dark:border-dark-border shadow-sm hover:shadow-md transition-shadow group"
              >
                <div className="h-40 bg-slate-100 dark:bg-dark-bg overflow-hidden">
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt={altText}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-3xl text-slate-300">
                        explore
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <h2 className="text-sm font-semibold text-text-main dark:text-white truncate group-hover:text-primary transition-colors">
                    {place.name}
                  </h2>
                  <p className="text-xs text-text-secondary dark:text-dark-text-secondary truncate mt-0.5">
                    {place.address}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] font-medium text-text-muted dark:text-dark-text-secondary capitalize">
                      {t(`common.${place.religion}`) || place.religion}
                    </span>
                    {place.average_rating != null && (
                      <span className="flex items-center gap-0.5 text-[10px] text-amber-500 font-semibold">
                        <span
                          className="material-symbols-outlined text-[10px]"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          star
                        </span>
                        {place.average_rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center mt-8">
          <button
            type="button"
            onClick={() => fetchPlaces(cursor)}
            disabled={loading}
            className="px-6 py-2 rounded-xl bg-primary text-white font-medium text-sm hover:bg-primary-hover disabled:opacity-60 transition-colors"
          >
            {loading ? t('common.loading') : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}
