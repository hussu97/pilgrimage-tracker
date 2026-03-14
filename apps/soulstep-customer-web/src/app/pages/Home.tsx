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
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, useI18n } from '@/app/providers';
import { useHead } from '@/lib/hooks/useHead';
import { useLocation } from '@/app/contexts/LocationContext';
import { getHomepage } from '@/lib/api/client';
import type {
  HomepageData,
  HomepageRecommendedPlace,
  HomepagePopularPlace,
  HomepageFeaturedJourney,
  HomepagePopularCity,
} from '@/lib/api/client';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import JoinJourneyModal from '@/components/groups/JoinJourneyModal';
import AddToGroupSheet from '@/components/groups/AddToGroupSheet';
import HomeSkeleton from '@/components/common/skeletons/HomeSkeleton';
import type { Group } from '@/lib/types';

// ── Type aliases for local use ─────────────────────────────────────────────────

type RecommendedPlace = HomepageRecommendedPlace;
type PopularPlace = HomepagePopularPlace & { total_checkins_count?: number | null };
type FeaturedJourney = HomepageFeaturedJourney;

// ── Quick action accent colors ────────────────────────────────────────────────

const ACTION_CONFIG = [
  {
    key: 'map',
    icon: 'map',
    color: '#10B981',
    bgClass: 'bg-emerald-500/10',
    textClass: 'text-emerald-500',
  },
  {
    key: 'create',
    icon: 'add_circle',
    color: '#3B82F6',
    bgClass: 'bg-blue-500/10',
    textClass: 'text-blue-500',
  },
  {
    key: 'join',
    icon: 'group_add',
    color: '#8B5CF6',
    bgClass: 'bg-violet-500/10',
    textClass: 'text-violet-500',
  },
  {
    key: 'favorites',
    icon: 'favorite',
    color: '#F43F5E',
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

/** Horizontal place card — recommended */
function PlaceCardSmall({
  place,
  onAddToJourney,
}: {
  place: RecommendedPlace;
  onAddToJourney: (place: RecommendedPlace) => void;
}) {
  const { t } = useI18n();
  return (
    <Link to={`/places/${place.place_code}`}>
      <motion.div
        whileTap={{ scale: 0.97 }}
        className="w-[calc((100vw-2.5rem)/2.3)] lg:w-full flex-shrink-0 rounded-xl overflow-hidden shadow-sm border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface hover:scale-[1.02] hover:shadow-md transition-all duration-200"
      >
        <div className="h-28 lg:h-44 bg-slate-100 dark:bg-dark-border relative overflow-hidden">
          {place.image_url ? (
            <img
              src={getFullImageUrl(place.image_url)}
              alt={place.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span
                className="material-symbols-outlined text-3xl text-slate-300"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                place
              </span>
            </div>
          )}
          {place.distance_km != null && (
            <span className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
              {place.distance_km < 1
                ? `${Math.round(place.distance_km * 1000)}m`
                : `${place.distance_km}km`}
            </span>
          )}
        </div>
        <div className="p-2.5 lg:p-4">
          <p className="text-xs font-semibold text-text-primary dark:text-white line-clamp-1">
            {place.name}
          </p>
          <p className="text-[10px] text-text-muted dark:text-dark-text-secondary mt-0.5 capitalize">
            {t(`common.${place.religion}`) || place.religion}
          </p>
          <button
            onClick={(e) => {
              e.preventDefault();
              onAddToJourney(place);
            }}
            className="mt-2 text-[10px] font-semibold text-primary hover:underline"
          >
            + {t('map.addToJourney')}
          </button>
        </div>
      </motion.div>
    </Link>
  );
}

/** Horizontal popular place card — with rating + checkins */
function PopularPlaceCard({ place }: { place: PopularPlace }) {
  const { t } = useI18n();
  const imgUrl = place.images?.[0]?.url ? getFullImageUrl(place.images[0].url) : null;
  return (
    <Link to={`/places/${place.place_code}`}>
      <motion.div
        whileTap={{ scale: 0.97 }}
        className="w-[calc((100vw-2.5rem)/2.3)] lg:w-full flex-shrink-0 rounded-xl overflow-hidden shadow-sm border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface hover:scale-[1.02] hover:shadow-md transition-all duration-200"
      >
        <div className="h-28 lg:h-44 bg-slate-100 dark:bg-dark-border relative overflow-hidden">
          {imgUrl ? (
            <img src={imgUrl} alt={place.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span
                className="material-symbols-outlined text-3xl text-slate-300"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                place
              </span>
            </div>
          )}
          {place.distance != null && (
            <span className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
              {place.distance < 1
                ? `${Math.round(place.distance * 1000)}m`
                : `${place.distance.toFixed(1)}km`}
            </span>
          )}
        </div>
        <div className="p-2.5 lg:p-4">
          <p className="text-xs font-semibold text-text-primary dark:text-white line-clamp-1">
            {place.name}
          </p>
          <p className="text-[10px] text-text-muted dark:text-dark-text-secondary mt-0.5 capitalize">
            {t(`common.${place.religion}`) || place.religion}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            {place.average_rating != null && place.average_rating > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-500">
                ★ {place.average_rating.toFixed(1)}
              </span>
            )}
            {place.total_checkins_count != null && place.total_checkins_count > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-text-muted dark:text-dark-text-secondary">
                <span
                  className="material-symbols-outlined text-[12px]"
                  style={{ fontVariationSettings: "'FILL' 0" }}
                >
                  check_circle
                </span>
                {place.total_checkins_count}
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

/** Horizontal featured journey card */
function FeaturedJourneyCard({ journey }: { journey: FeaturedJourney }) {
  const { t } = useI18n();
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="w-[calc((100vw-2.5rem)/2.3)] lg:w-52 flex-shrink-0 rounded-xl overflow-hidden shadow-sm border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface hover:scale-[1.02] transition-transform duration-200"
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
        className="w-[calc((100vw-2.5rem)/2.3)] lg:w-full flex-shrink-0 rounded-xl overflow-hidden shadow-sm border border-slate-100 dark:border-dark-border hover:scale-[1.02] hover:shadow-md transition-all duration-200 cursor-pointer"
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
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-3">
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

  // Redirect to onboarding on first visit (no user + no flag)
  useEffect(() => {
    if (!user && !localStorage.getItem('onboarding_done')) {
      navigate('/onboarding', { replace: true });
    }
  }, [user, navigate]);

  const loadHomepage = useCallback(async () => {
    setLoading(true);
    try {
      const religions = user?.religions?.filter((r) => r !== 'all') ?? [];
      const data = await getHomepage({ lat: coords.lat, lng: coords.lng, religions });
      setHomeData(data);
    } catch {
      // silently skip
    } finally {
      setLoading(false);
    }
  }, [user?.religions, coords]);

  useEffect(() => {
    loadHomepage();
  }, [loadHomepage]);

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
                  <div className="flex flex-nowrap gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:flex-none">
                    {popularPlaces.map((place) => (
                      <PopularPlaceCard key={place.place_code} place={place} />
                    ))}
                  </div>
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
                  <div className="flex flex-nowrap gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:flex-none">
                    {popularCities.map((city) => (
                      <CityCollageCard key={city.city_slug} city={city} />
                    ))}
                  </div>
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
                  <div className="flex flex-nowrap gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:flex-none">
                    {recommended.map((place) => (
                      <PlaceCardSmall
                        key={place.place_code}
                        place={place}
                        onAddToJourney={(p) =>
                          user ? setAddToJourneyPlace(p) : navigate('/login')
                        }
                      />
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
                  <div className="flex flex-nowrap gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide md:flex-col md:overflow-visible md:flex-none">
                    {featured.map((j) => (
                      <FeaturedJourneyCard key={j.group_code} journey={j} />
                    ))}
                  </div>
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
