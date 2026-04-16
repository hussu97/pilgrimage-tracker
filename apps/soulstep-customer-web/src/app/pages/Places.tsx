'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useI18n } from '@/app/providers';
import { useHead } from '@/lib/hooks/useHead';
import { getPlaces } from '@/lib/api/client';
import type { Place } from '@/lib/types';
import PlaceCardUnified from '@/components/places/PlaceCardUnified';

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
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const PAGE_SIZE = 50;

  const fetchPlaces = useCallback(
    async (page: number = 1, reset = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const resp = await getPlaces(
          {
            religions: religion ? [religion as any] : undefined,
            page,
            page_size: PAGE_SIZE,
          },
          controller.signal,
        );
        if (reset) {
          setPlaces(resp.places);
        } else {
          setPlaces((prev) => [...prev, ...resp.places]);
        }
        setCurrentPage(page);
        setHasMore(page * PAGE_SIZE < resp.total);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // ignore other errors
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [religion],
  );

  useEffect(() => {
    setCurrentPage(1);
    fetchPlaces(1, true);
  }, [religion, fetchPlaces]);

  // Abort in-flight request on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {places.map((place) => (
            <PlaceCardUnified key={place.place_code} place={place} t={t} />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center mt-8">
          <button
            type="button"
            onClick={() => fetchPlaces(currentPage + 1)}
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
