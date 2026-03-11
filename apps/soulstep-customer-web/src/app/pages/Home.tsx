/**
 * Journey Dashboard — the home screen of SoulStep.
 *
 * Replaces the flat place-list Home with a journey-first experience:
 *   • Active Journey hero card with circular progress ring
 *   • Quick Actions row
 *   • Recommended Places carousel (backend /places/recommended)
 *   • Popular Journeys carousel (backend /groups/featured)
 *   • Recent Activity feed (from user's groups)
 *
 * Phase 1 — foundation skeleton + Phase 2 — full data wiring combined.
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

interface FeaturedJourney {
  group_code: string;
  name: string;
  description?: string;
  cover_image_url?: string | null;
  total_sites: number;
  member_count: number;
}

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

/** Quick action button */
function QuickAction({
  icon,
  label,
  to,
  onClick,
}: {
  icon: string;
  label: string;
  to?: string;
  onClick?: () => void;
}) {
  const inner = (
    <motion.div
      whileTap={{ scale: 0.94 }}
      className="flex flex-col items-center gap-2 cursor-pointer group"
    >
      <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-dark-surface flex items-center justify-center group-hover:bg-primary/10 transition-colors">
        <span
          className="material-symbols-outlined text-[22px] text-text-muted dark:text-dark-text-secondary group-hover:text-primary transition-colors"
          style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}
          aria-hidden
        >
          {icon}
        </span>
      </div>
      <span className="text-xs font-medium text-text-muted dark:text-dark-text-secondary text-center leading-tight">
        {label}
      </span>
    </motion.div>
  );
  if (to) return <Link to={to}>{inner}</Link>;
  return <button onClick={onClick}>{inner}</button>;
}

/** Horizontal place card */
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
              // TODO Phase 3: open "Add to Journey" bottom sheet
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

  useEffect(() => {
    fetchJourneys();
  }, [fetchJourneys]);

  useEffect(() => {
    fetchRecommended();
    fetchFeatured();
  }, [fetchRecommended, fetchFeatured]);

  const displayName = user?.display_name?.trim() || user?.email?.split('@')[0] || '';
  const activeJourneys = journeys.filter(
    (g) => (g.total_sites ?? 0) > 0 && (g.sites_visited ?? 0) < (g.total_sites ?? 0),
  );
  const primaryJourney = activeJourneys[0] ?? journeys[0] ?? null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-bg">
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

      <div className="px-4 pb-6 space-y-6 md:grid md:grid-cols-12 md:gap-6 md:space-y-0">
        {/* ── Left column (main content on desktop) ─────────── */}
        <div className="md:col-span-8 space-y-6">
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

          {/* Quick Actions */}
          <section>
            <div className="flex items-center justify-around bg-white dark:bg-dark-surface rounded-2xl shadow-sm p-4">
              <QuickAction icon="map" label={t('journey.exploreMap')} to="/home?view=map" />
              <QuickAction
                icon="add_circle"
                label={t('journey.newJourney')}
                onClick={() => navigate(user ? '/journeys/new' : '/login')}
              />
              <QuickAction icon="group_add" label={t('groups.joinGroup')} to="/join" />
              <QuickAction icon="favorite" label={t('favorites.title')} to="/favorites" />
            </div>
          </section>

          {/* Recommended Places */}
          {recommended.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-text-primary dark:text-white">
                  {t('journey.recommendedPlaces')}
                </h2>
                <Link to="/home" className="text-xs font-semibold text-primary">
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
  );
}
