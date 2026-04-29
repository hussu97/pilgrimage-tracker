'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useI18n } from '@/app/providers';
import { useHead } from '@/lib/hooks/useHead';
import { getPlaces } from '@/lib/api/client';
import type { Place, Religion } from '@/lib/types';
import PlaceCardUnified from '@/components/places/PlaceCardUnified';
import { useUmamiTracking } from '@/lib/hooks/useUmamiTracking';
import { EVENTS } from '@/lib/analytics/events';
import { useAuthRequired } from '@/lib/hooks/useAuthRequired';
import AddToGroupSheet from '@/components/groups/AddToGroupSheet';

const RELIGIONS: Array<{ value: Religion | ''; labelKey: string }> = [
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
  const [religion, setReligion] = useState<Religion | ''>('');
  const [search, setSearch] = useState('');
  const [openNow, setOpenNow] = useState(false);
  const [topRated, setTopRated] = useState(false);
  const [addToJourneyPlace, setAddToJourneyPlace] = useState<Place | null>(null);
  const { requireAuth } = useAuthRequired();
  const { trackUmamiEvent } = useUmamiTracking();
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
            religions: religion ? [religion] : undefined,
            search: search.trim() || undefined,
            open_now: openNow || undefined,
            top_rated: topRated || undefined,
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
    [openNow, religion, search, topRated],
  );

  useEffect(() => {
    setCurrentPage(1);
    fetchPlaces(1, true);
  }, [religion, search, openNow, topRated, fetchPlaces]);

  // Abort in-flight request on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-main dark:text-white mb-1">
          {t('discover.allPlacesTitle')}
        </h1>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
          {t('discover.allPlacesSubtitle')}
        </p>
      </div>

      <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-2 shadow-sm dark:border-dark-border dark:bg-dark-surface">
        <label htmlFor="places-search" className="sr-only">
          {t('discover.searchPlaceholder')}
        </label>
        <div className="flex items-center gap-2 px-2">
          <span className="material-symbols-outlined text-slate-400">search</span>
          <input
            id="places-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('discover.searchPlaceholder')}
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

      <div className="flex gap-2 flex-wrap mb-6">
        <button
          type="button"
          onClick={() => setOpenNow((value) => !value)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            openNow
              ? 'bg-primary text-white'
              : 'bg-slate-100 dark:bg-dark-surface text-text-secondary dark:text-dark-text-secondary hover:bg-slate-200 dark:hover:bg-dark-border'
          }`}
        >
          {t('discover.openNow')}
        </button>
        <button
          type="button"
          onClick={() => setTopRated((value) => !value)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            topRated
              ? 'bg-primary text-white'
              : 'bg-slate-100 dark:bg-dark-surface text-text-secondary dark:text-dark-text-secondary hover:bg-slate-200 dark:hover:bg-dark-border'
          }`}
        >
          {t('discover.topRated')}
        </button>
        {RELIGIONS.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => {
              setReligion(r.value);
              trackUmamiEvent(EVENTS.discover.filter_toggle, {
                source: 'places_list',
                filter: 'religion',
                value: r.value || 'all',
              });
            }}
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
            <PlaceCardUnified
              key={place.place_code}
              place={place}
              t={t}
              onCardClick={(p) =>
                trackUmamiEvent(EVENTS.discover.place_card_click, {
                  source: 'places_list',
                  place_code: p.place_code,
                  religion: p.religion,
                })
              }
              variant="recommended"
              onAddToJourney={(event) => {
                event.preventDefault();
                event.stopPropagation();
                requireAuth(() => setAddToJourneyPlace(place), 'visitor.loginToPlanJourney');
              }}
            />
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
            {loading ? t('common.loading') : t('common.loadMore')}
          </button>
        </div>
      )}

      {addToJourneyPlace && (
        <AddToGroupSheet
          placeCode={addToJourneyPlace.place_code}
          placeName={addToJourneyPlace.name}
          onClose={() => setAddToJourneyPlace(null)}
          t={t}
        />
      )}
    </div>
  );
}
