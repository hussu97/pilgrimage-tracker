'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from '@/lib/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth, useFeedback, useI18n } from '@/app/providers';
import { useLocation } from '@/app/contexts/LocationContext';
import { useAuthRequired } from '@/lib/hooks/useAuthRequired';
import { useHead } from '@/lib/hooks/useHead';
import { getHomepage, getPlaces, getBlogPosts } from '@/lib/api/client';
import type {
  HomepageData,
  HomepagePopularPlace,
  HomepageRecommendedPlace,
} from '@/lib/api/client';
import type { BlogPostSummary } from '@/lib/types/blog';
import type { Place, Religion } from '@/lib/types';
import PlaceCardUnified from '@/components/places/PlaceCardUnified';
import PlaceImage from '@/components/places/PlaceImage';
import JoinJourneyModal from '@/components/groups/JoinJourneyModal';
import {
  DISCOVERY_JOURNEY_DRAFT_KEY,
  buildDiscoveryJourneyDraft,
  filterDiscoveryCities,
} from '@/lib/utils/discovery';

const RELIGION_FILTERS: Array<{ value: Religion | ''; labelKey: string }> = [
  { value: '', labelKey: 'common.all' },
  { value: 'islam', labelKey: 'common.islam' },
  { value: 'hinduism', labelKey: 'common.hinduism' },
  { value: 'christianity', labelKey: 'common.christianity' },
  { value: 'buddhism', labelKey: 'common.buddhism' },
  { value: 'sikhism', labelKey: 'common.sikhism' },
];

function recommendedToPlace(place: HomepageRecommendedPlace): Place {
  return {
    place_code: place.place_code,
    name: place.name,
    religion: place.religion as Religion,
    place_type: 'sacred_site',
    lat: place.lat,
    lng: place.lng,
    address: place.address || place.city || '',
    images: place.image_url ? [{ url: place.image_url, display_order: 0 }] : [],
    distance: place.distance_km ?? undefined,
  };
}

function popularToPlace(place: HomepagePopularPlace): Place {
  return {
    place_code: place.place_code,
    name: place.name,
    religion: place.religion as Religion,
    place_type: 'sacred_site',
    lat: place.lat,
    lng: place.lng,
    address: place.address || place.city || '',
    images: (place.images ?? []).map((image, index) => ({
      url: image.url,
      display_order: index,
    })),
    average_rating: place.average_rating ?? undefined,
    review_count: place.review_count ?? undefined,
    distance: place.distance ?? undefined,
  };
}

function uniquePlaces(places: Place[]): Place[] {
  const seen = new Set<string>();
  return places.filter((place) => {
    if (!place) return false;
    if (seen.has(place.place_code)) return false;
    seen.add(place.place_code);
    return true;
  });
}

function ActiveJourneyStrip({ journey }: { journey: HomepageData['groups'][number] }) {
  const total = journey.total_sites ?? 0;
  const visited = journey.sites_visited ?? 0;
  const pct = total > 0 ? Math.round((visited / total) * 100) : 0;
  const { t } = useI18n();

  return (
    <Link
      to={`/journeys/${journey.group_code}`}
      className="group flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition hover:border-primary/30 hover:shadow-md dark:border-dark-border dark:bg-dark-surface"
    >
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-primary/10">
        <PlaceImage
          src={journey.cover_image_url}
          alt=""
          kind="route"
          className="h-full w-full object-cover"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-primary dark:text-white">
          {journey.name}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-dark-border">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[11px] font-semibold text-text-muted dark:text-dark-text-secondary">
            {pct}%
          </span>
        </div>
      </div>
      <span className="material-symbols-outlined text-slate-300 transition group-hover:text-primary">
        chevron_right
      </span>
      <span className="sr-only">{t('journey.continueJourney')}</span>
    </Link>
  );
}

export default function Home() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { showSuccess } = useFeedback();
  const { coords } = useLocation();
  const { requireAuth } = useAuthRequired();
  const navigate = useNavigate();

  useHead({
    title: t('discover.metaTitle'),
    description: t('discover.metaDescription'),
    canonicalUrl: 'https://soul-step.org/home',
    ogType: 'website',
  });

  const [homeData, setHomeData] = useState<HomepageData | null>(null);
  const [homeLoading, setHomeLoading] = useState(true);
  const [blogPosts, setBlogPosts] = useState<BlogPostSummary[]>([]);
  const [search, setSearch] = useState('');
  const [religion, setReligion] = useState<Religion | ''>('');
  const [openNow, setOpenNow] = useState(false);
  const [topRated, setTopRated] = useState(false);
  const [queryPlaces, setQueryPlaces] = useState<Place[]>([]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [selectedPlaces, setSelectedPlaces] = useState<Place[]>([]);
  const [joinOpen, setJoinOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!user && !localStorage.getItem('onboarding_done')) setShowWelcome(true);
  }, [user]);

  useEffect(() => {
    const filteredReligions = user?.religions?.filter((r: string) => r !== 'all') ?? [];
    setHomeLoading(true);
    getHomepage({ lat: coords.lat, lng: coords.lng, religions: filteredReligions })
      .then(setHomeData)
      .catch(() => setHomeData(null))
      .finally(() => setHomeLoading(false));
  }, [coords.lat, coords.lng, user?.religions]);

  useEffect(() => {
    getBlogPosts({ limit: 8 })
      .then(setBlogPosts)
      .catch(() => {});
  }, []);

  const hasActiveQuery = !!search.trim() || !!religion || openNow || topRated;

  useEffect(() => {
    if (!hasActiveQuery) {
      setQueryPlaces([]);
      abortRef.current?.abort();
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => {
      setQueryLoading(true);
      getPlaces(
        {
          search: search.trim() || undefined,
          religions: religion ? [religion] : undefined,
          open_now: openNow || undefined,
          top_rated: topRated || undefined,
          lat: coords.lat,
          lng: coords.lng,
          sort: coords.lat != null && coords.lng != null ? 'distance' : undefined,
          page_size: 12,
        },
        controller.signal,
      )
        .then((res) => setQueryPlaces(res.places))
        .catch((err) => {
          if (!(err instanceof DOMException && err.name === 'AbortError')) setQueryPlaces([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setQueryLoading(false);
        });
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [coords.lat, coords.lng, hasActiveQuery, openNow, religion, search, topRated]);

  const defaultPlaces = useMemo(() => {
    const recommended = homeData?.recommended_places.map(recommendedToPlace) ?? [];
    const popular = homeData?.popular_places.map(popularToPlace) ?? [];
    return uniquePlaces([...recommended, ...popular]).slice(0, 9);
  }, [homeData]);

  const visiblePlaces = hasActiveQuery ? queryPlaces : defaultPlaces;
  const activeJourney =
    homeData?.groups.find(
      (group) =>
        (group.total_sites ?? 0) > 0 && (group.sites_visited ?? 0) < (group.total_sites ?? 0),
    ) ?? homeData?.groups[0];
  const cities = filterDiscoveryCities(homeData?.popular_cities ?? [], 6);

  const addPlaceToPlan = useCallback(
    (place: Place) => {
      setSelectedPlaces((prev) => {
        if (prev.some((item) => item.place_code === place.place_code)) return prev;
        return [...prev, place];
      });
      showSuccess(t('discover.placeAdded'));
    },
    [showSuccess, t],
  );

  const handleAddToJourney = useCallback(
    (place: Place) => {
      requireAuth(() => addPlaceToPlan(place), 'visitor.loginToPlanJourney');
    },
    [addPlaceToPlan, requireAuth],
  );

  const removeSelectedPlace = (placeCode: string) => {
    setSelectedPlaces((prev) => prev.filter((place) => place.place_code !== placeCode));
  };

  const handleCreateJourney = () => {
    requireAuth(() => {
      localStorage.setItem(
        DISCOVERY_JOURNEY_DRAFT_KEY,
        JSON.stringify(buildDiscoveryJourneyDraft(selectedPlaces)),
      );
      navigate('/journeys/new');
    }, 'visitor.loginToPlanJourney');
  };

  const dismissWelcome = () => {
    localStorage.setItem('onboarding_done', '1');
    setShowWelcome(false);
  };

  return (
    <>
      <div className="min-h-screen bg-background-light dark:bg-dark-bg">
        <div className="mx-auto max-w-6xl px-4 py-5 lg:px-6 lg:py-8 xl:max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-5">
            <section className="lg:col-span-3">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                    {t('nav.discover')}
                  </p>
                  <h1 className="mt-2 text-2xl font-bold tracking-tight text-text-dark dark:text-white lg:text-3xl">
                    {t('discover.title')}
                  </h1>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-text-muted dark:text-dark-text-secondary lg:text-base">
                    {t('discover.subtitle')}
                  </p>
                </div>
                {homeData?.place_count ? (
                  <div className="hidden rounded-2xl bg-white px-4 py-3 text-right shadow-sm dark:bg-dark-surface sm:block">
                    <p className="text-lg font-bold tabular-nums text-text-primary dark:text-white">
                      {homeData.place_count.toLocaleString()}
                    </p>
                    <p className="text-xs text-text-muted dark:text-dark-text-secondary">
                      {t('dashboard.totalPlaces')}
                    </p>
                  </div>
                ) : null}
              </div>

              <AnimatePresence>
                {showWelcome && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="mb-5 rounded-2xl border border-primary/20 bg-primary/5 p-4 dark:bg-primary/10"
                  >
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined mt-0.5 text-primary">explore</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-text-primary dark:text-white">
                          {t('discover.welcomeTitle')}
                        </p>
                        <p className="mt-1 text-sm text-text-muted dark:text-dark-text-secondary">
                          {t('discover.welcomeBody')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={dismissWelcome}
                        className="rounded-full px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
                      >
                        {t('discover.welcomeAction')}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <form
                onSubmit={(event) => event.preventDefault()}
                className="mb-4 rounded-2xl border border-slate-100 bg-white p-2 shadow-sm dark:border-dark-border dark:bg-dark-surface"
              >
                <label htmlFor="discover-search" className="sr-only">
                  {t('discover.searchPlaceholder')}
                </label>
                <div className="flex items-center gap-2 px-2">
                  <span className="material-symbols-outlined text-slate-400">search</span>
                  <input
                    id="discover-search"
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
              </form>

              <div className="mb-6 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setOpenNow((value) => !value)}
                  className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold transition ${
                    openNow
                      ? 'bg-primary text-white'
                      : 'bg-white text-text-muted hover:text-primary dark:bg-dark-surface dark:text-dark-text-secondary'
                  }`}
                >
                  {t('discover.openNow')}
                </button>
                <button
                  type="button"
                  onClick={() => setTopRated((value) => !value)}
                  className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold transition ${
                    topRated
                      ? 'bg-primary text-white'
                      : 'bg-white text-text-muted hover:text-primary dark:bg-dark-surface dark:text-dark-text-secondary'
                  }`}
                >
                  {t('discover.topRated')}
                </button>
                {RELIGION_FILTERS.map((filter) => (
                  <button
                    key={filter.value || 'all'}
                    type="button"
                    onClick={() => setReligion(filter.value)}
                    className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold transition ${
                      religion === filter.value
                        ? 'bg-primary text-white'
                        : 'bg-white text-text-muted hover:text-primary dark:bg-dark-surface dark:text-dark-text-secondary'
                    }`}
                  >
                    {t(filter.labelKey)}
                  </button>
                ))}
              </div>

              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-text-primary dark:text-white">
                  {hasActiveQuery ? t('discover.results') : t('discover.recommended')}
                </h2>
                <Link
                  to="/map"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
                >
                  <span className="material-symbols-outlined text-[18px]">map</span>
                  {t('discover.viewMap')}
                </Link>
              </div>

              {(homeLoading && !homeData) || queryLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-[380px] rounded-3xl bg-slate-200/80 animate-pulse dark:bg-dark-surface"
                    />
                  ))}
                </div>
              ) : visiblePlaces.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {visiblePlaces.map((place) => (
                    <PlaceCardUnified
                      key={place.place_code}
                      place={place}
                      t={t}
                      variant="recommended"
                      onAddToJourney={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handleAddToJourney(place);
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-100 bg-white px-6 py-12 text-center dark:border-dark-border dark:bg-dark-surface">
                  <span className="material-symbols-outlined text-4xl text-slate-300">
                    search_off
                  </span>
                  <p className="mt-3 text-sm font-semibold text-text-primary dark:text-white">
                    {t('discover.noResults')}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setReligion('');
                      setOpenNow(false);
                      setTopRated(false);
                    }}
                    className="mt-3 text-sm font-semibold text-primary"
                  >
                    {t('home.clearFilters')}
                  </button>
                </div>
              )}
            </section>

            <aside className="space-y-6 lg:col-span-2 lg:sticky lg:top-24 lg:self-start">
              {activeJourney && <ActiveJourneyStrip journey={activeJourney} />}

              <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-text-primary dark:text-white">
                      {t('nav.journeys')}
                    </h2>
                    <p className="mt-1 text-sm text-text-muted dark:text-dark-text-secondary">
                      {t('discover.journeysHint')}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-primary">route</span>
                </div>
                <div className="mt-4 grid gap-2">
                  <Link
                    to="/journeys"
                    className="rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-primary-hover"
                  >
                    {t('discover.viewJourneys')}
                  </Link>
                  {user && (
                    <button
                      type="button"
                      onClick={() => setJoinOpen(true)}
                      className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-text-primary transition hover:border-primary/40 hover:text-primary dark:border-dark-border dark:text-white"
                    >
                      {t('journey.joinWithCode')}
                    </button>
                  )}
                </div>
              </section>

              {cities.length > 0 && (
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-base font-bold text-text-primary dark:text-white">
                      {t('discover.popularCities')}
                    </h2>
                    <Link to="/explore" className="text-xs font-semibold text-primary">
                      {t('common.showMore')}
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {cities.map((city) => (
                      <Link
                        key={city.city_slug}
                        to={`/explore/${city.city_slug}`}
                        className="group overflow-hidden rounded-2xl bg-white shadow-sm transition hover:shadow-md dark:bg-dark-surface"
                      >
                        <div className="relative h-24 bg-slate-100 dark:bg-dark-border">
                          <PlaceImage
                            src={city.top_images?.[0]}
                            alt=""
                            kind="city"
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" />
                          <div className="absolute bottom-2 left-2 right-2">
                            <p className="truncate text-sm font-bold text-white">{city.city}</p>
                            <p className="text-[11px] text-white/75">
                              {t('discover.cityPlaces').replace('{count}', String(city.count))}
                            </p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </aside>
          </div>

          {/* Blog carousel */}
          {blogPosts.length > 0 && (
            <section className="mt-10 lg:mt-12">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                    From the blog
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-text-dark dark:text-white lg:text-2xl">
                    Spiritual Travel Guides
                  </h2>
                </div>
                <Link
                  to="/blog"
                  className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                >
                  View all
                  <span className="material-icons text-[16px]">arrow_forward</span>
                </Link>
              </div>

              {/* Carousel: 2.3 peek on mobile, grid on desktop */}
              <div className="flex flex-nowrap overflow-x-auto gap-4 pb-2 -mx-4 px-4 lg:grid lg:grid-cols-3 xl:grid-cols-4 lg:mx-0 lg:px-0 lg:overflow-visible">
                {blogPosts.slice(0, 8).map((post) => (
                  <Link
                    key={post.slug}
                    to={`/blog/${post.slug}`}
                    className="group w-[calc((100vw-2.5rem)/2.3)] flex-shrink-0 flex flex-col rounded-2xl overflow-hidden border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 lg:w-auto"
                  >
                    <div
                      className={`h-36 flex-shrink-0 relative overflow-hidden ${
                        post.cover_image_url ? '' : `bg-gradient-to-br ${post.cover_gradient}`
                      }`}
                    >
                      {post.cover_image_url ? (
                        <img
                          src={post.cover_image_url}
                          alt={post.title}
                          className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                        />
                      ) : null}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                      <div className="absolute bottom-2 left-3">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
                          {post.category}
                        </span>
                      </div>
                    </div>
                    <div className="p-3 flex flex-col flex-1 gap-1.5">
                      <p className="text-sm font-bold text-text-main dark:text-white leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                        {post.title}
                      </p>
                      <p className="text-xs text-text-muted dark:text-dark-text-secondary line-clamp-2 flex-1">
                        {post.description}
                      </p>
                      <p className="text-[10px] text-text-muted dark:text-dark-text-secondary">
                        {post.reading_time} min read
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedPlaces.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed inset-x-3 bottom-[calc(var(--mobile-bottom-nav-height)_+_0.75rem)] z-[520] mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-dark-border dark:bg-dark-surface md:bottom-6"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
                <span className="shrink-0 text-xs font-bold uppercase tracking-[0.14em] text-primary">
                  {t('discover.selectedCount').replace('{count}', String(selectedPlaces.length))}
                </span>
                {selectedPlaces.map((place) => (
                  <button
                    key={place.place_code}
                    type="button"
                    onClick={() => removeSelectedPlace(place.place_code)}
                    className="inline-flex max-w-[180px] shrink-0 items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-text-primary dark:bg-dark-bg dark:text-white"
                  >
                    <span className="truncate">{place.name}</span>
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleCreateJourney}
                className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white transition hover:bg-primary-hover"
              >
                {t('discover.createFromSelected').replace('{count}', String(selectedPlaces.length))}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <JoinJourneyModal open={joinOpen} onClose={() => setJoinOpen(false)} />
    </>
  );
}
