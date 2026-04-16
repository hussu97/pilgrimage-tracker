'use client';

/**
 * Journey Dashboard — the home screen of SoulStep.
 *
 * Replaces the flat place-list Home with a journey-first experience:
 *   • Active Journey hero card with circular progress ring
 *   • Quick Actions 2×2 colorful card grid
 *   • Popular Places carousel (top-rated + most checked-in)
 *   • Popular Cities horizontal scroll
 *   • Recommended Places carousel (backend /places/recommended)
 *   • Popular Journeys carousel (backend /groups/featured)
 *   • Recent Activity feed (from user's groups)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from '@/lib/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, useI18n } from '@/app/providers';
import { useHead } from '@/lib/hooks/useHead';
import { useLocation } from '@/app/contexts/LocationContext';
import { getHomepage, getBlogPosts } from '@/lib/api/client';
import type {
  HomepageData,
  HomepageRecommendedPlace,
  HomepageFeaturedJourney,
  HomepagePopularCity,
} from '@/lib/api/client';
import type { BlogPostSummary } from '@/lib/types/blog';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import JoinJourneyModal from '@/components/groups/JoinJourneyModal';
import AddToGroupSheet from '@/components/groups/AddToGroupSheet';
import HomeSkeleton from '@/components/common/skeletons/HomeSkeleton';
import type { Group, Place } from '@/lib/types';
import PlaceCardUnified from '@/components/places/PlaceCardUnified';
import HorizontalCarousel from '@/components/common/HorizontalCarousel';
import { COLORS } from '@/lib/colors';

// ── Type aliases for local use ─────────────────────────────────────────────────

type RecommendedPlace = HomepageRecommendedPlace;
type FeaturedJourney = HomepageFeaturedJourney;

// ── Quick action accent colors ────────────────────────────────────────────────

const ACTION_CONFIG = [
  {
    key: 'map',
    icon: 'map',
    color: COLORS.actionMap,
    bgClass: 'bg-emerald-500/10',
    textClass: 'text-emerald-500',
  },
  {
    key: 'create',
    icon: 'add_circle',
    color: COLORS.actionCreate,
    bgClass: 'bg-blue-500/10',
    textClass: 'text-blue-500',
  },
  {
    key: 'join',
    icon: 'group_add',
    color: COLORS.actionJoin,
    bgClass: 'bg-violet-500/10',
    textClass: 'text-violet-500',
  },
  {
    key: 'favorites',
    icon: 'favorite',
    color: COLORS.actionFavorites,
    bgClass: 'bg-rose-500/10',
    textClass: 'text-rose-500',
  },
] as const;

// ── Sub-components ────────────────────────────────────────────────────────────

/** Circular SVG progress ring */
function ProgressRing({
  pct,
  size = 64,
  stroke = 5,
}: {
  pct: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className="rotate-[-90deg]"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="rgba(255,255,255,0.2)"
        strokeWidth={stroke}
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="white"
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="animate-[breathe_3s_ease-in-out_infinite]"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  );
}

/** Active journey hero card */
function ActiveJourneyCard({ journey }: { journey: Group }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const pct =
    (journey.total_sites ?? 0) > 0
      ? Math.round(((journey.sites_visited ?? 0) / (journey.total_sites ?? 1)) * 100)
      : 0;

  return (
    <motion.div
      layoutId={`journey-card-${journey.group_code}`}
      onClick={() => navigate(`/journeys/${journey.group_code}`)}
      className="relative h-44 rounded-2xl overflow-hidden cursor-pointer shadow-lg"
      whileTap={{ scale: 0.98 }}
    >
      {/* Cover / blurred background */}
      {journey.cover_image_url ? (
        <>
          <img
            src={getFullImageUrl(journey.cover_image_url)}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px]" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary-hover" />
      )}

      <div className="relative h-full p-4 flex flex-col justify-between text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
              {t('journey.activeJourney')}
            </p>
            <h2 className="text-xl font-bold mt-0.5 line-clamp-1">{journey.name}</h2>
          </div>
          {/* Progress ring */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <ProgressRing pct={pct} size={56} stroke={4} />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                {pct}%
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            {journey.next_place_name && (
              <p className="text-xs opacity-80">
                {t('journey.nextUp')}:{' '}
                <span className="font-semibold">{journey.next_place_name}</span>
              </p>
            )}
            <p className="text-xs opacity-70 mt-0.5">
              {journey.sites_visited ?? 0}/{journey.total_sites ?? 0}{' '}
              {t('journey.placesCount').replace('{count}', '')}
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/journeys/${journey.group_code}`);
            }}
            className="bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-1.5 rounded-full backdrop-blur-sm transition-colors"
          >
            {t('journey.continueJourney')}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/** Empty state when user has no journeys */
function EmptyJourneyCard() {
  const navigate = useNavigate();
  const { t } = useI18n();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-dark-border p-8 flex flex-col items-center text-center gap-3"
    >
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
        <span
          className="material-symbols-outlined text-3xl text-primary"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          route
        </span>
      </div>
      <div>
        <h3 className="font-bold text-text-primary dark:text-white text-lg">
          {t('journey.createFirst')}
        </h3>
        <p className="text-text-muted dark:text-dark-text-secondary text-sm mt-1 max-w-xs">
          {t('journey.createFirstDesc')}
        </p>
      </div>
      <button
        onClick={() => navigate('/journeys/new')}
        className="bg-primary hover:bg-primary-hover text-white font-semibold px-6 py-2.5 rounded-full text-sm transition-colors mt-1"
      >
        {t('journey.startPlanning')}
      </button>
    </motion.div>
  );
}

/** 2×2 grid of colorful quick-action cards */
function QuickActionsGrid({
  user,
  onJoinClick,
}: {
  user: { display_name?: string } | null;
  onJoinClick: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();

  const actions = [
    {
      ...ACTION_CONFIG[0],
      label: t('journey.exploreMap'),
      sub: t('nav.places'),
      href: '/map' as string | null,
      onClick: null as (() => void) | null,
    },
    {
      ...ACTION_CONFIG[1],
      label: t('journey.newJourney'),
      sub: t('journey.startPlanning'),
      href: user ? '/journeys/new' : '/login',
      onClick: null as (() => void) | null,
    },
    {
      ...ACTION_CONFIG[2],
      label: t('journey.joinWithCode'),
      sub: t('journey.joinExisting'),
      href: null,
      onClick: onJoinClick,
    },
    {
      ...ACTION_CONFIG[3],
      label: t('favorites.title'),
      sub: t('favorites.savedPlaces'),
      href: '/favorites',
      onClick: null as (() => void) | null,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {actions.map((a) => (
        <motion.div key={a.key} whileTap={{ scale: 0.97 }}>
          {a.href ? (
            <Link
              to={a.href}
              className="flex flex-col items-start gap-2.5 p-4 rounded-2xl bg-white dark:bg-dark-surface border border-slate-100 dark:border-dark-border shadow-sm hover:shadow-md transition-all group"
            >
              <div
                className={`w-11 h-11 rounded-[14px] flex items-center justify-center ${a.bgClass}`}
              >
                <span
                  className={`material-symbols-outlined text-[22px] ${a.textClass}`}
                  style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}
                  aria-hidden
                >
                  {a.icon}
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary dark:text-white leading-tight">
                  {a.label}
                </p>
                {a.sub && (
                  <p className="text-[11px] text-text-muted dark:text-dark-text-secondary mt-0.5 leading-tight">
                    {a.sub}
                  </p>
                )}
              </div>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (a.onClick) a.onClick();
                else if (a.href) navigate(a.href);
              }}
              className="w-full flex flex-col items-start gap-2.5 p-4 rounded-2xl bg-white dark:bg-dark-surface border border-slate-100 dark:border-dark-border shadow-sm hover:shadow-md transition-all group text-left"
            >
              <div
                className={`w-11 h-11 rounded-[14px] flex items-center justify-center ${a.bgClass}`}
              >
                <span
                  className={`material-symbols-outlined text-[22px] ${a.textClass}`}
                  style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}
                  aria-hidden
                >
                  {a.icon}
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary dark:text-white leading-tight">
                  {a.label}
                </p>
                {a.sub && (
                  <p className="text-[11px] text-text-muted dark:text-dark-text-secondary mt-0.5 leading-tight">
                    {a.sub}
                  </p>
                )}
              </div>
            </button>
          )}
        </motion.div>
      ))}
    </div>
  );
}

/** Horizontal featured journey card */
function FeaturedJourneyCard({ journey }: { journey: FeaturedJourney }) {
  const { t } = useI18n();
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="w-[calc((100vw-2.5rem)/1.7)] lg:w-52 flex-shrink-0 rounded-xl overflow-hidden shadow-sm border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface hover:scale-[1.02] transition-transform duration-200"
    >
      <div className="h-28 bg-gradient-to-br from-primary/20 to-primary/5 relative overflow-hidden">
        {journey.cover_image_url && (
          <img
            src={getFullImageUrl(journey.cover_image_url)}
            alt={journey.name}
            className="w-full h-full object-cover"
          />
        )}
        {!journey.cover_image_url && (
          <div className="w-full h-full flex items-center justify-center">
            <span
              className="material-symbols-outlined text-3xl text-primary/40"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              route
            </span>
          </div>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-xs font-semibold text-text-primary dark:text-white line-clamp-1">
          {journey.name}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-text-muted dark:text-dark-text-secondary">
            {journey.total_sites} {t('journey.placesCount').replace('{count}', '').trim()}
          </span>
          <span className="text-slate-300 dark:text-dark-border">·</span>
          <span className="text-[10px] text-text-muted dark:text-dark-text-secondary">
            {journey.member_count} {t('journey.membersCount').replace('{count}', '').trim()}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/** City collage card — shows a 1/2/3-image collage with city name overlay */
function CityCollageCard({ city }: { city: HomepagePopularCity }) {
  const { t } = useI18n();
  const images = city.top_images ?? [];
  return (
    <Link to={`/explore/${city.city_slug}`}>
      <motion.div
        whileTap={{ scale: 0.97 }}
        className="w-[calc((100vw-2.5rem)/1.7)] lg:w-full flex-shrink-0 rounded-xl overflow-hidden shadow-sm border border-slate-100 dark:border-dark-border hover:scale-[1.02] hover:shadow-md transition-all duration-200 cursor-pointer"
      >
        <div className="h-36 relative overflow-hidden bg-slate-100 dark:bg-dark-border">
          {images.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center">
              <span className="material-icons text-4xl text-slate-300">location_city</span>
            </div>
          ) : images.length === 1 ? (
            <img
              src={getFullImageUrl(images[0])}
              alt={city.city}
              className="w-full h-full object-cover"
            />
          ) : images.length === 2 ? (
            <div className="flex h-full gap-px">
              <img src={getFullImageUrl(images[0])} alt="" className="w-1/2 h-full object-cover" />
              <img src={getFullImageUrl(images[1])} alt="" className="w-1/2 h-full object-cover" />
            </div>
          ) : (
            <div className="flex h-full gap-px">
              <img src={getFullImageUrl(images[0])} alt="" className="w-1/2 h-full object-cover" />
              <div className="w-1/2 flex flex-col gap-px">
                <img
                  src={getFullImageUrl(images[1])}
                  alt=""
                  className="flex-1 w-full object-cover"
                />
                <img
                  src={getFullImageUrl(images[2])}
                  alt=""
                  className="flex-1 w-full object-cover"
                />
              </div>
            </div>
          )}
          {/* Glass overlay */}
          <div
            className="absolute bottom-3 left-3 right-3 rounded-2xl p-3 border"
            style={{
              background: 'rgba(255,255,255,0.15)',
              borderColor: 'rgba(255,255,255,0.25)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            <p className="text-sm font-bold text-white line-clamp-1">{city.city}</p>
            <p className="text-[10px] text-white/75 mt-0.5">
              {city.count} {t('nav.places').toLowerCase()}
            </p>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

/** Animated place count ticker — counts up from 0 to total */
function PlaceCountTicker({ total }: { total: number }) {
  const { t } = useI18n();
  const [displayed, setDisplayed] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (total <= 0) return;
    const duration = 1200; // ms
    const start = performance.now();
    startRef.current = start;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * total));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [total]);

  const formatted = displayed.toLocaleString();

  return (
    <div>
      <p className="text-3xl font-bold text-text-primary dark:text-white tabular-nums leading-none">
        {formatted}
      </p>
      <p className="text-xs text-text-muted dark:text-dark-text-secondary mt-0.5">
        {t('dashboard.totalPlaces')}
      </p>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Home() {
  useHead({
    title: 'Your Journey Dashboard — SoulStep',
    description:
      'Plan your pilgrimage, track your sacred sites, and share your spiritual journey with others.',
    canonicalUrl: 'https://soul-step.org/home',
    ogType: 'website',
  });

  const { user } = useAuth();
  const { t } = useI18n();
  const { coords } = useLocation();
  const navigate = useNavigate();

  const [joinOpen, setJoinOpen] = useState(false);
  const [addToJourneyPlace, setAddToJourneyPlace] = useState<RecommendedPlace | null>(null);
  const [homeData, setHomeData] = useState<HomepageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [blogPosts, setBlogPosts] = useState<BlogPostSummary[]>([]);

  // Redirect to onboarding on first visit (no user + no flag)
  useEffect(() => {
    if (!user && !localStorage.getItem('onboarding_done')) {
      navigate('/onboarding', { replace: true });
    }
  }, [user, navigate]);

  // Track the latest params in a ref so we can debounce/deduplicate calls.
  // user?.religions and coords change independently (auth resolve, then geolocation),
  // but we only need one API call once both have settled.
  const paramsRef = useRef({ religions: user?.religions, coords });
  paramsRef.current = { religions: user?.religions, coords };
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasFetched = useRef(false);

  const loadHomepage = useCallback(async () => {
    const { religions, coords: c } = paramsRef.current;
    const filteredReligions = religions?.filter((r: string) => r !== 'all') ?? [];
    // Don't show loading skeleton if we already have data (background refresh)
    if (!hasFetched.current) setLoading(true);
    try {
      const data = await getHomepage({ lat: c.lat, lng: c.lng, religions: filteredReligions });
      setHomeData(data);
      hasFetched.current = true;
    } catch {
      // silently skip
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce: wait 150ms after the last dependency change before fetching.
  // This collapses the auth-resolve + geolocation-resolve into a single call.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(
      () => {
        loadHomepage();
      },
      hasFetched.current ? 150 : 0,
    ); // First load is immediate
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user?.religions, coords, loadHomepage]);

  // Fetch blog posts once on mount (fire-and-forget; doesn't block main load)
  useEffect(() => {
    getBlogPosts()
      .then((posts) => setBlogPosts(posts.slice(0, 3)))
      .catch(() => {});
  }, []);

  const journeys = homeData?.groups ?? [];
  const journeysLoading = loading && !homeData;
  const recommended = homeData?.recommended_places ?? [];
  const featured = homeData?.featured_journeys ?? [];
  const popularPlaces = homeData?.popular_places ?? [];
  const popularCities = homeData?.popular_cities ?? [];
  const placeCount = homeData?.place_count ?? 0;

  if (loading && !homeData) return <HomeSkeleton />;

  const activeJourneys = journeys.filter(
    (g) => (g.total_sites ?? 0) > 0 && (g.sites_visited ?? 0) < (g.total_sites ?? 0),
  );
  const primaryJourney = activeJourneys[0] ?? journeys[0] ?? null;

  return (
    <>
      <div className="min-h-screen bg-slate-50 dark:bg-dark-bg">
        <div className="max-w-2xl lg:max-w-6xl xl:max-w-7xl mx-auto">
          {/* ── Top bar ─────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-4 pt-safe-top pt-4 pb-2">
            <PlaceCountTicker total={placeCount} />
            {/* Profile avatar — mobile only; desktop header has its own */}
            <Link
              to="/profile"
              className="lg:hidden w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm hover:bg-primary/20 transition-colors"
            >
              {user?.display_name?.[0]?.toUpperCase() ?? (
                <span
                  className="material-symbols-outlined text-[18px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  person
                </span>
              )}
            </Link>
          </div>

          <div className="px-4 pb-6 space-y-5 lg:grid lg:grid-cols-5 lg:gap-8 lg:space-y-0">
            {/* ── Left column (main content on desktop) ─────────── */}
            <div className="lg:col-span-3 space-y-5 lg:space-y-8">
              {/* Active Journey Card */}
              <section>
                <AnimatePresence mode="wait">
                  {journeysLoading ? (
                    <motion.div
                      key="skeleton"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="h-44 rounded-2xl bg-slate-200 dark:bg-dark-surface animate-pulse"
                    />
                  ) : primaryJourney ? (
                    <motion.div
                      key="card"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <ActiveJourneyCard journey={primaryJourney} />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <EmptyJourneyCard />
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>

              {/* Quick Actions — 2×2 colorful card grid */}
              <section>
                <QuickActionsGrid user={user} onJoinClick={() => setJoinOpen(true)} />
              </section>

              {/* Popular Places */}
              {popularPlaces.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-base lg:text-lg font-bold text-text-primary dark:text-white">
                      {t('dashboard.popularPlaces')}
                    </h2>
                  </div>
                  <HorizontalCarousel
                    ariaLabel={t('dashboard.popularPlaces') || 'Popular places'}
                    className="-mx-1 px-1 lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:flex-none"
                  >
                    {popularPlaces.map((place) => (
                      <PlaceCardUnified
                        key={place.place_code}
                        place={place as unknown as Place}
                        t={t}
                        className="w-[calc((100vw-2.5rem)/1.7)] lg:w-full flex-shrink-0"
                      />
                    ))}
                  </HorizontalCarousel>
                </section>
              )}

              {/* Popular Cities — collage carousel on mobile only; desktop shows in sidebar */}
              {popularCities.length > 0 && (
                <section className="lg:hidden">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-base lg:text-lg font-bold text-text-primary dark:text-white">
                      {t('dashboard.popularCities')}
                    </h2>
                    <Link to="/explore" className="text-xs font-semibold text-primary">
                      {t('common.showMore')}
                    </Link>
                  </div>
                  <HorizontalCarousel
                    ariaLabel={t('home.exploreCities') || 'Explore cities'}
                    className="-mx-1 px-1 lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:flex-none"
                  >
                    {popularCities.map((city) => (
                      <CityCollageCard key={city.city_slug} city={city} />
                    ))}
                  </HorizontalCarousel>
                </section>
              )}

              {/* Recommended Places */}
              {recommended.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-base lg:text-lg font-bold text-text-primary dark:text-white">
                      {t('journey.recommendedPlaces')}
                    </h2>
                    <Link to="/places" className="text-xs font-semibold text-primary">
                      {t('common.showMore')}
                    </Link>
                  </div>
                  <HorizontalCarousel
                    ariaLabel={t('home.recommended') || 'Recommended places'}
                    className="-mx-1 px-1 lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:flex-none"
                  >
                    {recommended.map((place) => {
                      const placeObj = {
                        place_code: place.place_code,
                        name: place.name,
                        address: '',
                        images: place.image_url ? [{ url: place.image_url }] : [],
                        distance: place.distance_km ?? null,
                      } as unknown as Place;
                      return (
                        <PlaceCardUnified
                          key={place.place_code}
                          place={placeObj}
                          t={t}
                          variant="recommended"
                          onAddToJourney={(e) => {
                            e.preventDefault();
                            if (user) {
                              setAddToJourneyPlace(place);
                            } else {
                              navigate('/login');
                            }
                          }}
                          className="w-[calc((100vw-2.5rem)/1.7)] lg:w-full flex-shrink-0"
                        />
                      );
                    })}
                  </HorizontalCarousel>
                </section>
              )}

              {/* From Our Blog */}
              {blogPosts.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-base lg:text-lg font-bold text-text-primary dark:text-white">
                      From Our Blog
                    </h2>
                    <Link to="/blog" className="text-xs font-semibold text-primary">
                      View all
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {blogPosts.map((post) => (
                      <Link
                        key={post.slug}
                        to={`/blog/${post.slug}`}
                        className="group flex flex-col rounded-xl overflow-hidden border border-slate-100 dark:border-dark-border hover:shadow-md transition-shadow"
                      >
                        <div
                          className={`h-24 bg-gradient-to-br ${post.cover_gradient} relative flex-shrink-0`}
                        >
                          <span className="absolute top-2 left-2 bg-white/20 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                            {post.category}
                          </span>
                        </div>
                        <div className="p-3 flex flex-col flex-1 bg-white dark:bg-dark-surface">
                          <p className="text-xs font-semibold text-text-primary dark:text-white leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                            {post.title}
                          </p>
                          <p className="mt-1 text-[11px] text-text-muted dark:text-dark-text-secondary">
                            {post.reading_time} min read
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* ── Right column (desktop sidebar) ────────────────── */}
            <div className="lg:col-span-2 lg:sticky lg:top-24 space-y-8">
              {/* Popular Journeys */}
              {featured.length > 0 && (
                <section>
                  <h2 className="text-base lg:text-lg font-bold text-text-primary dark:text-white mb-3">
                    {t('journey.popularJourneys')}
                  </h2>
                  <HorizontalCarousel
                    ariaLabel={t('journey.popularJourneys') || 'Popular journeys'}
                    className="-mx-1 px-1 md:flex-col md:overflow-visible md:flex-none"
                  >
                    {featured.map((j) => (
                      <FeaturedJourneyCard key={j.group_code} journey={j} />
                    ))}
                  </HorizontalCarousel>
                </section>
              )}

              {/* Popular Cities — desktop sidebar collage grid */}
              {popularCities.length > 0 && (
                <section className="hidden lg:block">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-base lg:text-lg font-bold text-text-primary dark:text-white">
                      {t('dashboard.popularCities')}
                    </h2>
                    <Link to="/explore" className="text-xs font-semibold text-primary">
                      {t('common.showMore')}
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {popularCities.slice(0, 8).map((city) => (
                      <CityCollageCard key={city.city_slug} city={city} />
                    ))}
                  </div>
                </section>
              )}

              {/* My Journeys list (if any beyond active) */}
              {journeys.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-base lg:text-lg font-bold text-text-primary dark:text-white">
                      {t('journey.myJourneys')}
                    </h2>
                    <Link to="/groups" className="text-xs font-semibold text-primary">
                      {t('common.showMore')}
                    </Link>
                  </div>
                  <div className="space-y-2">
                    {journeys.slice(0, 3).map((j) => {
                      const pct =
                        (j.total_sites ?? 0) > 0
                          ? Math.round(((j.sites_visited ?? 0) / (j.total_sites ?? 1)) * 100)
                          : 0;
                      return (
                        <Link
                          key={j.group_code}
                          to={`/journeys/${j.group_code}`}
                          className="flex items-center gap-3 bg-white dark:bg-dark-surface rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow"
                        >
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {j.cover_image_url ? (
                              <img
                                src={getFullImageUrl(j.cover_image_url)}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span
                                className="material-symbols-outlined text-xl text-primary"
                                style={{ fontVariationSettings: "'FILL' 1" }}
                              >
                                route
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-text-primary dark:text-white truncate">
                              {j.name}
                            </p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <div className="flex-1 h-1 rounded-full bg-slate-100 dark:bg-dark-border overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-text-muted dark:text-dark-text-secondary ml-1">
                                {pct}%
                              </span>
                            </div>
                          </div>
                          <span
                            className="material-symbols-outlined text-[18px] text-slate-300"
                            aria-hidden
                          >
                            chevron_right
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Join Journey Modal */}
      <JoinJourneyModal open={joinOpen} onClose={() => setJoinOpen(false)} />

      {/* Add to Journey sheet */}
      {addToJourneyPlace && (
        <AddToGroupSheet
          placeCode={addToJourneyPlace.place_code}
          placeName={addToJourneyPlace.name}
          onClose={() => setAddToJourneyPlace(null)}
          t={t}
        />
      )}
    </>
  );
}
