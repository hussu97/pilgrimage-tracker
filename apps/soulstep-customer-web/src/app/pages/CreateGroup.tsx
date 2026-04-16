'use client';

/**
 * Journey Creation Flow — Phase 3 redesign.
 *
 * Step 1 — Intent: 4 animated cards ("Explore My City" / "A Specific Faith" /
 *           "A Famous Route" / "Start from Scratch")
 * Step 2 — Build Route: searchable place list + map preview sidebar (web)
 * Step 3 — Polish: name, description, privacy, cover image, dates
 * Step 4 — Success: confetti + invite share
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from '@/lib/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, useI18n, useFeedback } from '@/app/providers';
import { useLocation } from '@/app/contexts/LocationContext';
import { useUmamiTracking } from '@/lib/hooks/useUmamiTracking';
import { cn } from '@/lib/utils/cn';
import {
  createGroup,
  getPlaces,
  uploadGroupCover,
  getCities,
  getFeaturedGroups,
  getGroup,
} from '@/lib/api/client';
import type { FeaturedGroup } from '@/lib/api/client';
import { shareUrl } from '@/lib/share';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import type { Place } from '@/lib/types';
import { COLORS } from '@/lib/colors';

// ── Types ─────────────────────────────────────────────────────────────────────

type JourneyIntent = 'city' | 'faith' | 'route' | 'scratch';
type Step = 'intent' | 'build' | 'polish' | 'success';
type BuildSubStep = 'city_pick' | 'faith_pick' | 'route_pick' | null;

// ── Intent card config ─────────────────────────────────────────────────────────

const INTENT_CARDS: Array<{
  id: JourneyIntent;
  icon: string;
  titleKey: string;
  title: string;
  subtitle: string;
  gradient: string;
}> = [
  {
    id: 'city',
    icon: 'location_city',
    titleKey: 'intent.city',
    title: 'Explore My City',
    subtitle: 'Discover sacred sites near you',
    gradient: 'from-amber-500/20 to-orange-500/10',
  },
  {
    id: 'faith',
    icon: 'auto_awesome',
    titleKey: 'intent.faith',
    title: 'A Specific Faith',
    subtitle: 'Focus on one religion or tradition',
    gradient: 'from-primary/20 to-primary/5',
  },
  {
    id: 'route',
    icon: 'route',
    titleKey: 'intent.route',
    title: 'A Famous Route',
    subtitle: 'Follow a known pilgrimage path',
    gradient: 'from-blue-500/15 to-indigo-500/10',
  },
  {
    id: 'scratch',
    icon: 'edit',
    titleKey: 'intent.scratch',
    title: 'Start from Scratch',
    subtitle: 'Build your own custom journey',
    gradient: 'from-emerald-500/15 to-teal-500/10',
  },
];

// ── Auto name generation ──────────────────────────────────────────────────────

function generateJourneyName(
  intent: JourneyIntent,
  places: Place[],
  selectedCity?: string | null,
  selectedFaith?: string | null,
  selectedRoute?: FeaturedGroup | null,
): string {
  if (intent === 'city' && selectedCity) return `${selectedCity} Sacred Journey`;
  if (intent === 'faith' && selectedFaith) {
    const r = selectedFaith.charAt(0).toUpperCase() + selectedFaith.slice(1);
    return `${r} Journey`;
  }
  if (intent === 'route' && selectedRoute) return selectedRoute.name;
  const location = places[0]?.address?.split(',')[0];
  const religion = places[0]?.religion;
  if (intent === 'city' && location) return `${location} Sacred Journey`;
  if (intent === 'faith' && religion) {
    const r = religion.charAt(0).toUpperCase() + religion.slice(1);
    return location ? `${location} ${r} Circuit` : `${r} Journey`;
  }
  if (intent === 'route') return 'Pilgrimage Route';
  return 'My Sacred Journey';
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Horizontal progress indicator */
function StepIndicator({ step }: { step: Step }) {
  const steps: Step[] = ['intent', 'build', 'polish'];
  const labels = ['Choose Intent', 'Build Route', 'Review'];
  const idx = steps.indexOf(step);
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-3">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2 flex-1">
          <div
            className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all',
              i < idx
                ? 'bg-primary text-white'
                : i === idx
                  ? 'bg-primary text-white ring-2 ring-primary/30'
                  : 'bg-slate-100 dark:bg-dark-surface text-text-muted dark:text-dark-text-secondary',
            )}
          >
            {i < idx ? <span className="material-symbols-outlined text-[14px]">check</span> : i + 1}
          </div>
          <span
            className={cn(
              'text-xs font-medium hidden sm:block',
              i === idx ? 'text-primary' : 'text-text-muted dark:text-dark-text-secondary',
            )}
          >
            {labels[i]}
          </span>
          {i < steps.length - 1 && (
            <div
              className={cn(
                'flex-1 h-0.5 rounded',
                i < idx ? 'bg-primary' : 'bg-slate-200 dark:bg-dark-border',
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** Selected place chip in the build route step */
function SelectedPlaceChip({
  place,
  index,
  onRemove,
}: {
  place: Place;
  index: number;
  onRemove: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="flex items-center gap-2 bg-primary/10 dark:bg-primary/20 text-primary rounded-lg px-3 py-1.5"
    >
      <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
        {index + 1}
      </span>
      <span className="text-xs font-medium truncate max-w-[120px]">{place.name}</span>
      <button
        onClick={onRemove}
        aria-label={`Remove ${place.name}`}
        className="hover:text-primary-hover ml-1"
      >
        <span className="material-symbols-outlined text-[14px]">close</span>
      </button>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CreateGroup() {
  const navigate = useNavigate();
  const { t } = useI18n();
  useAuth();
  const { showError } = useFeedback();
  const { trackUmamiEvent } = useUmamiTracking();
  const { coords } = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Step state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('intent');
  const [intent, setIntent] = useState<JourneyIntent | null>(null);

  // ── Build step sub-step state ────────────────────────────────────────────────
  const [buildSubStep, setBuildSubStep] = useState<BuildSubStep>(null);
  const [selectedCity, setSelectedCity] = useState<{ city: string; city_slug: string } | null>(
    null,
  );
  const [selectedFaith, setSelectedFaith] = useState<string | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<FeaturedGroup | null>(null);
  const [cities, setCities] = useState<
    Array<{ city: string; city_slug: string; count: number; top_images?: string[] }>
  >([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [featuredRoutes, setFeaturedRoutes] = useState<FeaturedGroup[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);

  // ── Build route state ───────────────────────────────────────────────────────
  const [allPlaces, setAllPlaces] = useState<Place[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlaces, setSelectedPlaces] = useState<Place[]>([]);

  // ── Polish step state ────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverImageUrl, setCoverImageUrl] = useState('');

  // ── Submit state ─────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [groupCode, setGroupCode] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  // ── Load places when entering build step ────────────────────────────────────
  const loadPlaces = useCallback(
    async (opts?: { city?: string; religions?: string[] }) => {
      setPlacesLoading(true);
      try {
        const res = await getPlaces({
          lat: coords.lat,
          lng: coords.lng,
          sort: 'distance',
          page_size: 100,
          city: opts?.city,
          religions: (opts?.religions as any) ?? undefined,
        });
        setAllPlaces(res.places ?? []);
      } catch {
        setAllPlaces([]);
      } finally {
        setPlacesLoading(false);
      }
    },
    [coords],
  );

  useEffect(() => {
    if (step === 'build' && buildSubStep === null)
      loadPlaces(
        selectedCity
          ? { city: selectedCity.city }
          : selectedFaith
            ? { religions: [selectedFaith] }
            : undefined,
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, buildSubStep]);

  // Auto-generate name when entering polish step
  useEffect(() => {
    if (step === 'polish' && !name && intent) {
      setName(
        generateJourneyName(
          intent,
          selectedPlaces,
          selectedCity?.city,
          selectedFaith,
          selectedRoute,
        ),
      );
      if (!coverImageUrl && selectedPlaces[0]) {
        // Auto-set cover from first place
        const img = (selectedPlaces[0] as Place & { image_url?: string }).image_url;
        if (img) setCoverImageUrl(img);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Filtered places for search
  const filteredPlaces = allPlaces.filter((p) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.address ?? '').toLowerCase().includes(q) ||
      (p.place_type ?? '').toLowerCase().includes(q)
    );
  });

  const selectedCodes = new Set(selectedPlaces.map((p) => p.place_code));

  const togglePlace = (place: Place) => {
    if (selectedCodes.has(place.place_code)) {
      setSelectedPlaces((prev) => prev.filter((p) => p.place_code !== place.place_code));
    } else {
      setSelectedPlaces((prev) => [...prev, place]);
    }
  };

  // ── Cover image handling ─────────────────────────────────────────────────────
  const handleCoverPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setCoverPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // ── Submit journey ────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      let finalCoverUrl = coverImageUrl;
      if (coverFile) {
        const result = await uploadGroupCover(coverFile);
        finalCoverUrl = result.url;
      }
      const g = await createGroup({
        name: name.trim(),
        description: description.trim() || undefined,
        is_private: isPrivate,
        path_place_codes:
          selectedPlaces.length > 0 ? selectedPlaces.map((p) => p.place_code) : undefined,
        cover_image_url: finalCoverUrl || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      trackUmamiEvent('journey_create', { intent, place_count: selectedPlaces.length });
      setGroupCode(g.group_code);
      setInviteCode(g.invite_code);
      setStep('success');
    } catch (err) {
      showError(t('feedback.error'));
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Rendered steps ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-bg flex flex-col lg:max-w-3xl lg:mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <button
          onClick={() => {
            if (step === 'intent') navigate(-1);
            else if (step === 'build') {
              if (buildSubStep !== null) {
                setStep('intent');
                setBuildSubStep(null);
                setSelectedCity(null);
                setSelectedFaith(null);
                setAllPlaces([]);
                setSelectedPlaces([]);
              } else if (intent !== 'scratch' && (selectedCity || selectedFaith)) {
                if (intent === 'city') {
                  setBuildSubStep('city_pick');
                  setAllPlaces([]);
                } else if (intent === 'faith') {
                  setBuildSubStep('faith_pick');
                  setAllPlaces([]);
                }
              } else {
                setStep('intent');
                setBuildSubStep(null);
              }
            } else if (step === 'polish') setStep('build');
          }}
          className="w-9 h-9 rounded-full bg-white dark:bg-dark-surface shadow-sm flex items-center justify-center text-text-muted hover:text-primary transition-colors"
          aria-label={t('common.back')}
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-text-primary dark:text-white">
            {t('journey.createJourney')}
          </h1>
        </div>
        {step !== 'intent' && step !== 'success' && (
          <button
            onClick={() => navigate(-1)}
            className="text-xs text-text-muted dark:text-dark-text-secondary hover:text-primary"
          >
            {t('onboarding.skip')}
          </button>
        )}
      </div>

      {/* Step indicator */}
      {step !== 'success' && <StepIndicator step={step} />}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {/* ── Step 1: Intent ──────────────────────────────────────────────── */}
          {step === 'intent' && (
            <motion.div
              key="intent"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="px-4 py-6 w-full"
            >
              <p className="text-text-muted dark:text-dark-text-secondary text-sm mb-6">
                What kind of journey are you planning?
              </p>
              <div className="grid grid-cols-2 gap-3">
                {INTENT_CARDS.map((card, i) => (
                  <motion.button
                    key={card.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => {
                      setSelectedCity(null);
                      setSelectedFaith(null);
                      setAllPlaces([]);
                      setSelectedPlaces([]);
                      setIntent(card.id);
                      if (card.id === 'city') {
                        setBuildSubStep('city_pick');
                        setCitiesLoading(true);
                        getCities({ page_size: 50, include_images: true })
                          .then((d) => setCities(d.items ?? []))
                          .catch(() => setCities([]))
                          .finally(() => setCitiesLoading(false));
                      } else if (card.id === 'faith') {
                        setBuildSubStep('faith_pick');
                      } else if (card.id === 'route') {
                        setBuildSubStep('route_pick');
                        setRoutesLoading(true);
                        getFeaturedGroups()
                          .then((d) => setFeaturedRoutes(d ?? []))
                          .catch(() => setFeaturedRoutes([]))
                          .finally(() => setRoutesLoading(false));
                      } else {
                        setBuildSubStep(null);
                      }
                      setStep('build');
                    }}
                    className={cn(
                      'flex flex-col items-start gap-3 p-4 rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm hover:shadow-md hover:border-primary/30 transition-all text-left',
                      `bg-gradient-to-br ${card.gradient}`,
                    )}
                  >
                    <div className="w-10 h-10 rounded-xl bg-white/80 dark:bg-dark-surface flex items-center justify-center shadow-sm">
                      <span
                        className="material-symbols-outlined text-[22px] text-primary"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                        aria-hidden
                      >
                        {card.icon}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-text-primary dark:text-white leading-tight">
                        {card.title}
                      </p>
                      <p className="text-[11px] text-text-muted dark:text-dark-text-secondary mt-0.5 leading-tight">
                        {card.subtitle}
                      </p>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Step 2: Build Route ─────────────────────────────────────────── */}
          {step === 'build' && (
            <motion.div
              key={`build-${buildSubStep ?? 'list'}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col h-full"
            >
              {/* ── City picker sub-step ──────────────────────────────────────── */}
              {buildSubStep === 'city_pick' && (
                <div className="px-4 py-6 w-full">
                  <p className="text-lg font-bold text-text-primary dark:text-white mb-1">
                    {t('journey.pickCity') || 'Choose your city'}
                  </p>
                  <p className="text-sm text-text-muted dark:text-dark-text-secondary mb-5">
                    {t('journey.intent.cityDesc') || 'Discover sacred sites near you'}
                  </p>
                  {citiesLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <span className="material-symbols-outlined text-3xl text-slate-300 animate-spin">
                        progress_activity
                      </span>
                    </div>
                  ) : cities.length === 0 ? (
                    <p className="text-center text-text-muted py-8 text-sm">
                      {t('home.noPlacesFound')}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {cities.map((c) => (
                        <button
                          key={c.city_slug}
                          onClick={() => {
                            setSelectedCity({ city: c.city, city_slug: c.city_slug });
                            setBuildSubStep(null);
                            setAllPlaces([]);
                            loadPlaces({ city: c.city });
                          }}
                          className="w-full flex flex-col gap-2 px-4 py-3 rounded-xl bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border hover:border-primary/40 transition-all text-left"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-text-primary dark:text-white">
                              {c.city}
                            </span>
                            <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-lg">
                              {c.count}
                            </span>
                          </div>
                          {(c.top_images?.length ?? 0) > 0 && (
                            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                              {c.top_images!.slice(0, 4).map((imgUrl, idx) => (
                                <img
                                  key={idx}
                                  src={getFullImageUrl(imgUrl)}
                                  alt=""
                                  className="w-16 h-12 rounded-lg object-cover flex-shrink-0"
                                />
                              ))}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Faith picker sub-step ────────────────────────────────────── */}
              {buildSubStep === 'faith_pick' && (
                <div className="px-4 py-6 w-full">
                  <p className="text-lg font-bold text-text-primary dark:text-white mb-1">
                    {t('journey.pickFaith') || 'Choose your faith'}
                  </p>
                  <p className="text-sm text-text-muted dark:text-dark-text-secondary mb-5">
                    {t('journey.intent.faithDesc') || 'Focus on one religion or tradition'}
                  </p>
                  <div className="space-y-3">
                    {[
                      {
                        id: 'islam',
                        label: 'Islam',
                        icon: 'mosque',
                        color: COLORS.faithIslam,
                        desc: 'Mosques & Islamic sites',
                      },
                      {
                        id: 'hinduism',
                        label: 'Hinduism',
                        icon: 'temple_hindu',
                        color: COLORS.faithHinduism,
                        desc: 'Temples & Hindu sites',
                      },
                      {
                        id: 'christianity',
                        label: 'Christianity',
                        icon: 'church',
                        color: COLORS.faithChristianity,
                        desc: 'Churches & Christian sites',
                      },
                    ].map((f) => (
                      <button
                        key={f.id}
                        onClick={() => {
                          setSelectedFaith(f.id);
                          setBuildSubStep(null);
                          setAllPlaces([]);
                          loadPlaces({ religions: [f.id] });
                        }}
                        className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 hover:shadow-md transition-all text-left"
                        style={{ borderColor: f.color + '40', background: f.color + '10' }}
                      >
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: f.color + '20' }}
                        >
                          <span
                            className="material-symbols-outlined text-[28px]"
                            style={{ color: f.color, fontVariationSettings: "'FILL' 1" }}
                          >
                            {f.icon}
                          </span>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-text-primary dark:text-white">
                            {f.label}
                          </p>
                          <p className="text-xs text-text-muted dark:text-dark-text-secondary">
                            {f.desc}
                          </p>
                        </div>
                        <span className="material-symbols-outlined text-[20px] text-text-muted">
                          chevron_right
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Route picker sub-step ────────────────────────────────────── */}
              {buildSubStep === 'route_pick' && (
                <div className="px-4 py-6 w-full">
                  <p className="text-lg font-bold text-text-primary dark:text-white mb-1">
                    {t('journey.pickRoute') || 'Choose a famous route'}
                  </p>
                  <p className="text-sm text-text-muted dark:text-dark-text-secondary mb-5">
                    {t('journey.intent.routeDesc') || 'Follow a known pilgrimage path'}
                  </p>
                  {routesLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <span className="material-symbols-outlined text-3xl text-slate-300 animate-spin">
                        progress_activity
                      </span>
                    </div>
                  ) : featuredRoutes.length === 0 ? (
                    <div className="text-center py-8 space-y-3">
                      <span className="material-symbols-outlined text-5xl text-slate-300">
                        route
                      </span>
                      <p className="text-sm text-text-muted">
                        {t('journey.routeNoResults') || 'No famous routes yet — search manually'}
                      </p>
                      <button
                        onClick={() => {
                          setBuildSubStep(null);
                          loadPlaces();
                        }}
                        className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold"
                      >
                        {t('common.search') || 'Search manually'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {featuredRoutes.map((route) => (
                        <button
                          key={route.group_code}
                          onClick={async () => {
                            try {
                              const detail = await getGroup(route.group_code);
                              if (detail.path_place_codes?.length) {
                                const res = await getPlaces({ page_size: 100 });
                                const placesMap = new Map(
                                  (res.places ?? []).map((p) => [p.place_code, p]),
                                );
                                const ordered = detail.path_place_codes
                                  .map((code: string) => placesMap.get(code))
                                  .filter(Boolean) as Place[];
                                setSelectedPlaces(ordered);
                                setAllPlaces(res.places ?? []);
                              }
                              setSelectedRoute(route);
                              setBuildSubStep(null);
                            } catch {
                              setSelectedRoute(route);
                              setBuildSubStep(null);
                              loadPlaces();
                            }
                          }}
                          className="w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface hover:shadow-md transition-all text-left"
                        >
                          {route.cover_image_url ? (
                            <img
                              src={getFullImageUrl(route.cover_image_url)}
                              alt=""
                              className="w-full h-28 object-cover"
                            />
                          ) : (
                            <div className="w-full h-28 bg-slate-100 dark:bg-dark-border flex items-center justify-center">
                              <span className="material-symbols-outlined text-4xl text-slate-400">
                                route
                              </span>
                            </div>
                          )}
                          <div className="p-3">
                            <p className="text-sm font-bold text-text-primary dark:text-white">
                              {route.name}
                            </p>
                            {route.description && (
                              <p className="text-xs text-text-muted dark:text-dark-text-secondary mt-0.5 line-clamp-2">
                                {route.description}
                              </p>
                            )}
                            <p className="text-xs text-primary font-semibold mt-1">
                              {route.total_sites} sites
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Place list (main build view) ──────────────────────────────── */}
              {buildSubStep === null && (
                <>
                  {/* Active filter chip */}
                  {(selectedCity || selectedFaith) && (
                    <div className="px-4 pt-3 pb-1">
                      <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-semibold">
                        <span
                          className="material-symbols-outlined text-[14px]"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          {selectedCity ? 'location_city' : 'auto_awesome'}
                        </span>
                        {selectedCity
                          ? selectedCity.city
                          : selectedFaith
                            ? selectedFaith.charAt(0).toUpperCase() + selectedFaith.slice(1)
                            : ''}
                        <button
                          onClick={() => {
                            if (intent === 'city') {
                              setSelectedCity(null);
                              setBuildSubStep('city_pick');
                              setAllPlaces([]);
                            } else if (intent === 'faith') {
                              setSelectedFaith(null);
                              setBuildSubStep('faith_pick');
                              setAllPlaces([]);
                            }
                          }}
                          aria-label="Clear filter"
                          className="ml-1 hover:text-primary-hover"
                        >
                          <span className="material-symbols-outlined text-[12px]">close</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Selected places strip */}
                  {selectedPlaces.length > 0 && (
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-dark-border">
                      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                        <span className="text-xs font-semibold text-text-muted dark:text-dark-text-secondary flex-shrink-0">
                          {selectedPlaces.length} selected
                        </span>
                        <AnimatePresence>
                          {selectedPlaces.map((p, i) => (
                            <SelectedPlaceChip
                              key={p.place_code}
                              place={p}
                              index={i}
                              onRemove={() => togglePlace(p)}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}

                  {/* Search */}
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-dark-border">
                    <div className="relative">
                      <span
                        className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[18px] text-text-muted"
                        aria-hidden
                      >
                        search
                      </span>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t('groups.searchPlaces')}
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface text-sm text-text-primary dark:text-white placeholder:text-text-muted dark:placeholder:text-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  </div>

                  {/* Place list */}
                  <div className="flex-1 overflow-y-auto px-4 py-2">
                    {placesLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <span className="material-symbols-outlined text-3xl text-slate-300 animate-spin">
                          progress_activity
                        </span>
                      </div>
                    ) : filteredPlaces.length === 0 ? (
                      <p className="text-center text-text-muted py-8 text-sm">
                        {t('home.noPlacesFound')}
                      </p>
                    ) : (
                      <div className="space-y-1 pb-24">
                        {filteredPlaces.map((place) => {
                          const isSelected = selectedCodes.has(place.place_code);
                          return (
                            <motion.button
                              key={place.place_code}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => togglePlace(place)}
                              className={cn(
                                'w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left',
                                isSelected
                                  ? 'bg-primary/10 dark:bg-primary/15 border border-primary/30'
                                  : 'bg-white dark:bg-dark-surface border border-transparent hover:border-slate-200 dark:hover:border-dark-border',
                              )}
                            >
                              <div className="w-14 h-14 rounded-lg bg-slate-100 dark:bg-dark-border flex-shrink-0 overflow-hidden">
                                {place.images?.[0]?.url ? (
                                  <img
                                    src={getFullImageUrl(place.images[0].url)}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <span
                                      className="material-symbols-outlined text-xl text-slate-400"
                                      aria-hidden
                                      style={{ fontVariationSettings: "'FILL' 1" }}
                                    >
                                      place
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-text-primary dark:text-white truncate">
                                  {place.name}
                                </p>
                                <p className="text-[11px] text-text-muted dark:text-dark-text-secondary capitalize truncate">
                                  {place.religion} · {place.address}
                                </p>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  {place.distance != null && (
                                    <span className="text-[10px] font-semibold text-text-muted dark:text-dark-text-secondary">
                                      {place.distance < 1
                                        ? `${Math.round(place.distance * 1000)}m`
                                        : `${place.distance.toFixed(1)}km`}
                                    </span>
                                  )}
                                  {place.open_status === 'open' && (
                                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                      Open
                                    </span>
                                  )}
                                  {place.open_status === 'closed' && (
                                    <span className="text-[10px] font-semibold text-red-500 dark:text-red-400">
                                      Closed
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div
                                className={cn(
                                  'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all',
                                  isSelected
                                    ? 'bg-primary text-white'
                                    : 'border-2 border-slate-300 dark:border-dark-border',
                                )}
                              >
                                {isSelected && (
                                  <span
                                    className="material-symbols-outlined text-[14px]"
                                    style={{ fontVariationSettings: "'FILL' 1" }}
                                  >
                                    check
                                  </span>
                                )}
                              </div>
                            </motion.button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Continue CTA */}
                  <div className="fixed bottom-0 left-0 right-0 md:static p-4 bg-white/90 dark:bg-dark-bg/90 backdrop-blur-sm border-t border-slate-100 dark:border-dark-border">
                    <button
                      onClick={() => setStep('polish')}
                      className={cn(
                        'w-full py-3 rounded-xl font-semibold text-white transition-all',
                        selectedPlaces.length > 0
                          ? 'bg-primary hover:bg-primary-hover'
                          : 'bg-primary/50 cursor-default',
                      )}
                    >
                      {selectedPlaces.length > 0
                        ? `Continue with ${selectedPlaces.length} place${selectedPlaces.length > 1 ? 's' : ''}`
                        : 'Continue without places'}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ── Step 3: Polish ──────────────────────────────────────────────── */}
          {step === 'polish' && (
            <motion.div
              key="polish"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="px-4 py-6 w-full space-y-5 pb-32"
            >
              {/* Cover image */}
              <div>
                <label className="block text-xs font-semibold text-text-muted dark:text-dark-text-secondary uppercase tracking-wider mb-2">
                  {t('groups.coverImage')}
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="h-36 rounded-2xl overflow-hidden border-2 border-dashed border-slate-200 dark:border-dark-border cursor-pointer hover:border-primary/50 transition-colors flex items-center justify-center bg-white dark:bg-dark-surface"
                >
                  {coverPreview || coverImageUrl ? (
                    <img
                      src={coverPreview ?? getFullImageUrl(coverImageUrl)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-text-muted dark:text-dark-text-secondary">
                      <span className="material-symbols-outlined text-3xl" aria-hidden>
                        add_photo_alternate
                      </span>
                      <span className="text-sm">{t('groups.addCoverPhoto')}</span>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverPick}
                />
              </div>

              {/* Name */}
              <div>
                <label
                  htmlFor="journey-name"
                  className="block text-xs font-semibold text-text-muted dark:text-dark-text-secondary uppercase tracking-wider mb-1.5"
                >
                  {t('groups.nameLabel')} *
                </label>
                <input
                  id="journey-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('groups.groupNamePlaceholder')}
                  className="w-full border border-input-border dark:border-dark-border rounded-xl px-4 py-3 text-sm bg-white dark:bg-dark-surface text-text-primary dark:text-white placeholder:text-text-muted dark:placeholder:text-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="journey-desc"
                  className="block text-xs font-semibold text-text-muted dark:text-dark-text-secondary uppercase tracking-wider mb-1.5"
                >
                  {t('groups.descriptionLabel')}
                </label>
                <textarea
                  id="journey-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('groups.descriptionPlaceholder')}
                  rows={3}
                  className="w-full border border-input-border dark:border-dark-border rounded-xl px-4 py-3 text-sm bg-white dark:bg-dark-surface text-text-primary dark:text-white placeholder:text-text-muted dark:placeholder:text-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="start-date"
                    className="block text-xs font-semibold text-text-muted dark:text-dark-text-secondary uppercase tracking-wider mb-1.5"
                  >
                    {t('groups.startDate')}
                  </label>
                  <input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full border border-input-border dark:border-dark-border rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-dark-surface text-text-primary dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label
                    htmlFor="end-date"
                    className="block text-xs font-semibold text-text-muted dark:text-dark-text-secondary uppercase tracking-wider mb-1.5"
                  >
                    {t('groups.endDate')}
                  </label>
                  <input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full border border-input-border dark:border-dark-border rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-dark-surface text-text-primary dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              {/* Privacy */}
              <button
                type="button"
                onClick={() => setIsPrivate(!isPrivate)}
                className={cn(
                  'w-full flex items-center justify-between p-4 rounded-xl border transition-all',
                  isPrivate
                    ? 'border-primary/30 bg-primary/5 dark:bg-primary/10'
                    : 'border-input-border dark:border-dark-border bg-white dark:bg-dark-surface',
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'material-symbols-outlined text-[20px]',
                      isPrivate ? 'text-primary' : 'text-text-muted dark:text-dark-text-secondary',
                    )}
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {isPrivate ? 'lock' : 'public'}
                  </span>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-text-primary dark:text-white">
                      {t('groups.privateGroup')}
                    </p>
                    <p className="text-xs text-text-muted dark:text-dark-text-secondary">
                      {isPrivate ? 'Invite only' : 'Anyone can join with link'}
                    </p>
                  </div>
                </div>
                <div
                  className={cn(
                    'w-10 h-6 rounded-full transition-all relative',
                    isPrivate ? 'bg-primary' : 'bg-slate-200 dark:bg-dark-border',
                  )}
                >
                  <div
                    className={cn(
                      'absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm',
                      isPrivate ? 'left-5' : 'left-1',
                    )}
                  />
                </div>
              </button>

              {/* Summary */}
              {selectedPlaces.length > 0 && (
                <div className="bg-white dark:bg-dark-surface rounded-xl p-4 border border-slate-100 dark:border-dark-border">
                  <p className="text-xs font-semibold text-text-muted dark:text-dark-text-secondary uppercase tracking-wider mb-2">
                    Route Summary
                  </p>
                  <p className="text-sm text-text-primary dark:text-white">
                    {selectedPlaces.length} place{selectedPlaces.length > 1 ? 's' : ''}
                  </p>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {selectedPlaces.slice(0, 5).map((p) => (
                      <span
                        key={p.place_code}
                        className="text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium"
                      >
                        {p.name}
                      </span>
                    ))}
                    {selectedPlaces.length > 5 && (
                      <span className="text-[10px] text-text-muted dark:text-dark-text-secondary px-2 py-0.5">
                        +{selectedPlaces.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ── Step 4: Success ─────────────────────────────────────────────── */}
          {step === 'success' && groupCode && inviteCode && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center min-h-[70vh] px-6 py-8 text-center gap-6 max-w-sm mx-auto"
            >
              {/* Animated check */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.1 }}
                className="w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center"
              >
                <span
                  className="material-symbols-outlined text-4xl text-primary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <h2 className="text-2xl font-bold text-text-primary dark:text-white">
                  {t('journey.successTitle')}
                </h2>
                <p className="text-text-muted dark:text-dark-text-secondary text-sm mt-2">
                  {t('journey.successDesc')}
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="w-full space-y-3"
              >
                {/* Invite link */}
                <div className="flex gap-2 w-full">
                  <input
                    readOnly
                    value={`${window.location.origin}/join?code=${inviteCode}`}
                    className="flex-1 text-xs border border-input-border dark:border-dark-border rounded-xl px-3 py-2.5 bg-slate-50 dark:bg-dark-surface text-text-primary dark:text-white"
                  />
                  <button
                    onClick={() =>
                      shareUrl(
                        t('groups.shareMessage'),
                        `${window.location.origin}/join?code=${inviteCode}`,
                      )
                    }
                    className="px-3 py-2.5 rounded-xl border border-input-border dark:border-dark-border text-text-muted hover:text-primary transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">share</span>
                  </button>
                </div>

                <button
                  onClick={() => navigate(`/journeys/${groupCode}`)}
                  className="w-full py-3 rounded-xl bg-primary hover:bg-primary-hover text-white font-semibold text-sm transition-colors"
                >
                  {t('journey.startExploring')}
                </button>
                <button
                  onClick={() => navigate('/home')}
                  className="w-full py-3 rounded-xl border border-slate-200 dark:border-dark-border text-text-muted dark:text-dark-text-secondary text-sm hover:bg-white dark:hover:bg-dark-surface transition-colors"
                >
                  {t('common.backToHome')}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Fixed CTA for polish step */}
      {step === 'polish' && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 dark:bg-dark-bg/90 backdrop-blur-sm border-t border-slate-100 dark:border-dark-border">
          <button
            onClick={handleSubmit}
            disabled={submitting || !name.trim()}
            className={cn(
              'w-full py-3 rounded-xl font-semibold text-white text-sm transition-all',
              submitting || !name.trim()
                ? 'bg-primary/50 cursor-not-allowed'
                : 'bg-primary hover:bg-primary-hover',
            )}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[16px] animate-spin">
                  progress_activity
                </span>
                Creating…
              </span>
            ) : (
              t('groups.createAndInvite')
            )}
          </button>
        </div>
      )}
    </div>
  );
}
