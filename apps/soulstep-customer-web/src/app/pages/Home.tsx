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
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, useI18n } from '@/app/providers';
import { useHead } from '@/lib/hooks/useHead';
import { useLocation } from '@/app/contexts/LocationContext';
import { getGroups } from '@/lib/api/client';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import type { Group } from '@/lib/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecommendedPlace {
  place_code: string;
  name: string;
  religion: string;
  address: string;
  city?: string;
  image_url?: string | null;
  distance_km?: number | null;
}

interface PopularPlace {
  place_code: string;
  name: string;
  religion: string;
  images: { url: string }[];
  average_rating?: number | null;
  review_count?: number | null;
  total_checkins_count?: number | null;
  distance?: number | null;
}

interface PopularCity {
  city: string;
  city_slug: string;
  count: number;
}

interface FeaturedJourney {
  group_code: string;
  name: string;
  description?: string;
  cover_image_url?: string | null;
  total_sites: number;
  member_count: number;
}

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

// ── API calls (typed thin wrappers) ──────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function getFeaturedJourneys(): Promise<FeaturedJourney[]> {
  const res = await fetch(`${API_BASE}/api/v1/groups/featured`, { credentials: 'include' });
  if (!res.ok) return [];
  return res.json();
}

async function getRecommendedPlaces(params: {
  lat?: number;
  lng?: number;
  religions?: string[];
}): Promise<RecommendedPlace[]> {
  const qs = new URLSearchParams();
  if (params.lat != null) qs.set('lat', String(params.lat));
  if (params.lng != null) qs.set('lng', String(params.lng));
  (params.religions ?? []).forEach((r) => qs.append('religions', r));
  const res = await fetch(`${API_BASE}/api/v1/places/recommended?${qs}`, {
    credentials: 'include',
  });
  if (!res.ok) return [];
  return res.json();
}

async function getPopularPlaces(): Promise<PopularPlace[]> {
  const qs = new URLSearchParams({
    sort: 'rating',
    include_rating: 'true',
    include_checkins: 'true',
    limit: '40',
  });
  const res = await fetch(`${API_BASE}/api/v1/places?${qs}`, { credentials: 'include' });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : (data.places ?? data.items ?? []);
}

async function getPopularCities(): Promise<PopularCity[]> {
  const res = await fetch(`${API_BASE}/api/v1/cities?limit=10`, { credentials: 'include' });
  if (!res.ok) return [];
  const data = await res.json();
  return data.cities ?? [];
}

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
function QuickActionsGrid({ user }: { user: { display_name?: string } | null }) {
  const { t } = useI18n();

  const actions = [
    {
      ...ACTION_CONFIG[0],
      label: t('journey.exploreMap'),
      sub: t('nav.places'),
      href: '/map',
    },
    {
      ...ACTION_CONFIG[1],
      label: t('journey.newJourney'),
      sub: t('journey.startPlanning'),
      href: user ? '/journeys/new' : '/login',
    },
    {
      ...ACTION_CONFIG[2],
      label: t('journey.joinWithCode'),
      sub: t('journey.joinExisting'),
      href: '/join',
    },
    {
      ...ACTION_CONFIG[3],
      label: t('favorites.title'),
      sub: t('favorites.savedPlaces'),
      href: '/favorites',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {actions.map((a) => (
        <motion.div key={a.key} whileTap={{ scale: 0.97 }}>
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
        </motion.div>
      ))}
    </div>
  );
}

/** Horizontal place card — recommended */
function PlaceCardSmall({ place }: { place: RecommendedPlace }) {
  const { t } = useI18n();
  return (
    <Link to={`/places/${place.place_code}`}>
      <motion.div
        whileTap={{ scale: 0.97 }}
        className="w-44 flex-shrink-0 rounded-xl overflow-hidden shadow-sm border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface"
      >
        <div className="h-28 bg-slate-100 dark:bg-dark-border relative overflow-hidden">
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
        <div className="p-2.5">
          <p className="text-xs font-semibold text-text-primary dark:text-white line-clamp-1">
            {place.name}
          </p>
          <p className="text-[10px] text-text-muted dark:text-dark-text-secondary mt-0.5 capitalize">
            {place.religion}
          </p>
          <button
            onClick={(e) => {
              e.preventDefault();
              // TODO: open "Add to Journey" modal
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
  const imgUrl = place.images?.[0]?.url ? getFullImageUrl(place.images[0].url) : null;
  return (
    <Link to={`/places/${place.place_code}`}>
      <motion.div
        whileTap={{ scale: 0.97 }}
        className="w-48 flex-shrink-0 rounded-xl overflow-hidden shadow-sm border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface"
      >
        <div className="h-28 bg-slate-100 dark:bg-dark-border relative overflow-hidden">
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
        <div className="p-2.5">
          <p className="text-xs font-semibold text-text-primary dark:text-white line-clamp-1">
            {place.name}
          </p>
          <p className="text-[10px] text-text-muted dark:text-dark-text-secondary mt-0.5 capitalize">
            {place.religion}
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
      className="w-52 flex-shrink-0 rounded-xl overflow-hidden shadow-sm border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface"
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

  const [journeys, setJourneys] = useState<Group[]>([]);
  const [journeysLoading, setJourneysLoading] = useState(false);
  const [recommended, setRecommended] = useState<RecommendedPlace[]>([]);
  const [featured, setFeatured] = useState<FeaturedJourney[]>([]);
  const [popularPlaces, setPopularPlaces] = useState<PopularPlace[]>([]);
  const [popularCities, setPopularCities] = useState<PopularCity[]>([]);

  // Redirect to onboarding on first visit (no user + no flag)
  useEffect(() => {
    if (!user && !localStorage.getItem('onboarding_done')) {
      navigate('/onboarding', { replace: true });
    }
  }, [user, navigate]);

  // Fetch user's journeys
  const fetchJourneys = useCallback(async () => {
    if (!user) return;
    setJourneysLoading(true);
    try {
      const data = await getGroups();
      setJourneys(Array.isArray(data) ? data : []);
    } catch {
      // silently skip
    } finally {
      setJourneysLoading(false);
    }
  }, [user]);

  // Fetch recommended places
  const fetchRecommended = useCallback(async () => {
    try {
      const religions = user?.religions?.filter((r) => r !== 'all') ?? [];
      const data = await getRecommendedPlaces({
        lat: coords.lat,
        lng: coords.lng,
        religions,
      });
      setRecommended(data.slice(0, 10));
    } catch {
      // silently skip
    }
  }, [coords, user?.religions]);

  // Fetch featured journeys
  const fetchFeatured = useCallback(async () => {
    try {
      const data = await getFeaturedJourneys();
      setFeatured(data.slice(0, 10));
    } catch {
      // silently skip
    }
  }, []);

  const fetchPopular = useCallback(async () => {
    try {
      const [places, cities] = await Promise.all([getPopularPlaces(), getPopularCities()]);
      setPopularPlaces(places);
      setPopularCities(cities.slice(0, 10));
    } catch {
      // silently skip
    }
  }, []);

  useEffect(() => {
    fetchJourneys();
  }, [fetchJourneys]);

  useEffect(() => {
    fetchRecommended();
    fetchFeatured();
    fetchPopular();
  }, [fetchRecommended, fetchFeatured, fetchPopular]);

  const displayName = user?.display_name?.trim() || user?.email?.split('@')[0] || '';
  const activeJourneys = journeys.filter(
    (g) => (g.total_sites ?? 0) > 0 && (g.sites_visited ?? 0) < (g.total_sites ?? 0),
  );
  const primaryJourney = activeJourneys[0] ?? journeys[0] ?? null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-bg">
      <div className="max-w-2xl md:max-w-4xl mx-auto">
        {/* ── Top bar ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 pt-safe-top pt-4 pb-2">
          <div>
            <p className="text-xs text-text-muted dark:text-dark-text-secondary">
              {t('dashboard.greeting')}
            </p>
            {displayName ? (
              <h1 className="text-xl font-bold text-text-primary dark:text-white leading-tight">
                {displayName}
              </h1>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="text-sm font-semibold text-primary"
              >
                {t('dashboard.signIn')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/notifications"
              aria-label="Notifications"
              className="relative w-9 h-9 rounded-full bg-white dark:bg-dark-surface shadow-sm flex items-center justify-center text-text-muted dark:text-dark-text-secondary hover:text-primary transition-colors"
            >
              <span
                className="material-symbols-outlined text-[22px]"
                style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}
              >
                notifications
              </span>
            </Link>
            <Link
              to="/profile"
              className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm hover:bg-primary/20 transition-colors"
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
        </div>

        <div className="px-4 pb-6 space-y-5 md:grid md:grid-cols-12 md:gap-6 md:space-y-0">
          {/* ── Left column (main content on desktop) ─────────── */}
          <div className="md:col-span-8 space-y-5">
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
              <QuickActionsGrid user={user} />
            </section>

            {/* Popular Places */}
            {popularPlaces.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-text-primary dark:text-white">
                    {t('dashboard.popularPlaces')}
                  </h2>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                  {popularPlaces.map((place) => (
                    <PopularPlaceCard key={place.place_code} place={place} />
                  ))}
                </div>
              </section>
            )}

            {/* Popular Cities */}
            {popularCities.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-text-primary dark:text-white">
                    {t('dashboard.popularCities')}
                  </h2>
                  <Link to="/cities" className="text-xs font-semibold text-primary">
                    {t('common.showMore')}
                  </Link>
                </div>
                <div className="flex gap-2.5 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                  {popularCities.map((city) => (
                    <Link
                      key={city.city_slug}
                      to={`/cities/${city.city_slug}`}
                      className="flex-shrink-0"
                    >
                      <motion.div
                        whileTap={{ scale: 0.96 }}
                        className="px-4 py-2.5 rounded-full bg-white dark:bg-dark-surface border border-slate-100 dark:border-dark-border shadow-sm hover:shadow-md hover:border-primary/40 transition-all text-center min-w-[72px]"
                      >
                        <p className="text-sm font-semibold text-text-primary dark:text-white whitespace-nowrap">
                          {city.city}
                        </p>
                        <p className="text-[10px] text-text-muted dark:text-dark-text-secondary mt-0.5">
                          {city.count} {t('nav.places').toLowerCase()}
                        </p>
                      </motion.div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Recommended Places */}
            {recommended.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-text-primary dark:text-white">
                    {t('journey.recommendedPlaces')}
                  </h2>
                  <Link to="/places" className="text-xs font-semibold text-primary">
                    {t('common.showMore')}
                  </Link>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                  {recommended.map((place) => (
                    <PlaceCardSmall key={place.place_code} place={place} />
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ── Right column (desktop sidebar) ────────────────── */}
          <div className="md:col-span-4 space-y-6">
            {/* Popular Journeys */}
            {featured.length > 0 && (
              <section>
                <h2 className="text-base font-bold text-text-primary dark:text-white mb-3">
                  {t('journey.popularJourneys')}
                </h2>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide md:flex-col md:overflow-visible">
                  {featured.map((j) => (
                    <FeaturedJourneyCard key={j.group_code} journey={j} />
                  ))}
                </div>
              </section>
            )}

            {/* My Journeys list (if any beyond active) */}
            {journeys.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-text-primary dark:text-white">
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
  );
}
