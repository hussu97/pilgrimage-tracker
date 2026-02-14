import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useAuth, useI18n } from '@/app/providers';
import { useLocation } from '@/app/contexts/LocationContext';
import { getPlaces } from '@/lib/api/client';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import type { Place } from '@/lib/types';

type FilterChip = 'all' | 'mosque' | 'shrine' | 'temple';

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function PlaceCardFull({ place, t }: { place: Place; t: (k: string) => string }) {
  return (
    <Link
      to={`/places/${place.place_code}`}
      className="block relative h-72 rounded-3xl overflow-hidden shadow-glass group cursor-pointer transform transition-all duration-300 hover:shadow-xl hover:scale-[1.01]"
    >
      <div className="absolute inset-0">
        {place.image_urls?.[0] ? (
          <img
            src={place.image_urls[0]}
            alt=""
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-soft-blue flex items-center justify-center">
            <span className="material-symbols-outlined text-6xl text-slate-400">place</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/70" />
      </div>

      {/* Open Now badge */}
      {place.is_open_now && (
        <div className="absolute top-4 left-4 z-10">
          <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 backdrop-blur-md border border-emerald-400/30 rounded-full px-3 py-1 text-[10px] font-semibold text-white uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {t('places.openNow')}
          </span>
        </div>
      )}

      {/* Visited badge */}
      {place.user_has_checked_in && (
        <div className="absolute top-4 right-4 z-10">
          <span className="inline-flex items-center gap-1 bg-white/20 backdrop-blur-md border border-white/30 rounded-full px-3 py-1 text-[10px] font-semibold text-white uppercase tracking-wider">
            <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            {t('places.visited')}
          </span>
        </div>
      )}

      {/* Glass info panel */}
      <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
        <div className="bg-white/15 backdrop-blur-md rounded-2xl p-4 border border-white/30 text-white">
          <div className="flex justify-between items-start mb-2">
            <div className="flex-1 min-w-0 mr-2">
              <h3 className="font-semibold text-base leading-tight truncate">{place.name}</h3>
              <p className="text-xs text-white/80 font-light flex items-center gap-0.5 mt-0.5">
                <span className="material-symbols-outlined text-[12px]">location_on</span>
                <span className="truncate">{place.address || place.place_type}</span>
              </p>
            </div>
            {place.average_rating != null && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="material-symbols-outlined text-yellow-400 text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                <span className="text-sm font-medium">{place.average_rating.toFixed(1)}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/20">
            {place.distance != null ? (
              <span className="text-[11px] text-white/70 font-light">{formatDistance(place.distance)}</span>
            ) : (
              <span />
            )}
            <Link
              to={`/places/${place.place_code}/check-in`}
              onClick={(e) => e.stopPropagation()}
              className="bg-primary hover:bg-primary-hover text-white text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors"
            >
              {t('places.checkIn')}
            </Link>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const { coords } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterChip>('all');

  const FILTER_CHIPS: { key: FilterChip; labelKey: string; placeType?: string }[] = [
    { key: 'all', labelKey: 'home.filterAll' },
    { key: 'mosque', labelKey: 'home.filterMosques', placeType: 'mosque' },
    { key: 'shrine', labelKey: 'home.filterShrines', placeType: 'shrine' },
    { key: 'temple', labelKey: 'home.filterTemples', placeType: 'temple' },
  ];

  const fetchPlaces = useCallback(async () => {
    setLoading(true);
    setError('');
    const chip = FILTER_CHIPS.find((c) => c.key === filter);
    try {
      const data = await getPlaces({
        religions: user?.religions?.length ? user.religions : undefined,
        search: search || undefined,
        sort: 'distance',
        limit: 50,
        lat: coords.lat,
        lng: coords.lng,
        place_type: chip?.placeType,
      });
      setPlaces(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  }, [user?.religions, search, filter, coords, t]);

  useEffect(() => { fetchPlaces(); }, [fetchPlaces]);

  const handleSearchChange = (value: string) => {
    if (value) setSearchParams({ search: value });
    else setSearchParams({});
  };

  const displayName = user?.display_name?.trim() || user?.email?.split('@')[0] || t('home.title');

  return (
    <div className="min-h-full antialiased font-sans dark:bg-dark-bg" style={{ background: 'linear-gradient(180deg, #EBF5FF 0%, #FFFFFF 100%)' }}>
      <div className="px-4 md:px-6 pb-6 max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-6 pt-4">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-xs text-primary font-semibold tracking-[0.2em] uppercase mb-1">{t('nav.explore')}</p>
              <h1 className="text-2xl font-semibold text-slate-800 dark:text-white tracking-tight">
                {t('home.greeting')} <span className="font-bold">{displayName}</span>
              </h1>
            </div>
            <button
              type="button"
              onClick={() => navigate('/map')}
              aria-label={t('home.map')}
              className="w-10 h-10 rounded-full bg-white dark:bg-dark-surface shadow-card border border-slate-100 dark:border-dark-border flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">map</span>
            </button>
          </div>

          {/* Search bar */}
          <div className="flex items-center gap-2 bg-white dark:bg-dark-surface border border-slate-100 dark:border-dark-border rounded-2xl px-4 py-3 shadow-subtle mb-5">
            <span className="material-symbols-outlined text-slate-400 text-[20px]">search</span>
            <input
              type="search"
              aria-label={t('home.findPlace')}
              placeholder={t('home.findPlace')}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="flex-1 bg-transparent border-none p-0 text-sm text-slate-800 dark:text-white placeholder:text-text-muted focus:ring-0 focus:outline-none"
            />
            <button type="button" aria-label="Filter" className="text-slate-400 hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-[20px]">tune</span>
            </button>
          </div>

          {/* Filter chips */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
            {FILTER_CHIPS.map(({ key, labelKey }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  filter === key
                    ? 'bg-primary text-white shadow-floating'
                    : 'bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary'
                }`}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        </header>

        {/* Loading */}
        {loading && <p className="text-slate-500 py-8 text-sm">{t('home.loadingPlaces')}</p>}

        {/* Error */}
        {error && <ErrorState message={error} onRetry={fetchPlaces} retryLabel={t('common.retry')} />}

        {/* Empty */}
        {!loading && !error && places.length === 0 && (
          <EmptyState
            icon="explore"
            title={t('home.noPlacesFound')}
            description={search || filter !== 'all' ? t('home.clearFilters') : undefined}
            action={
              <button
                onClick={() => { setFilter('all'); setSearchParams({}); }}
                className="inline-block py-2 px-4 rounded-2xl bg-primary text-white text-sm font-medium hover:bg-primary-hover"
              >
                {t('home.clearFilters')}
              </button>
            }
          />
        )}

        {/* Place cards — uniform grid */}
        {!loading && !error && places.length > 0 && (
          <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0 lg:grid-cols-2">
            {places.map((place) => (
              <PlaceCardFull key={place.place_code} place={place} t={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
