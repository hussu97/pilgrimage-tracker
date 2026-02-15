import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth, useI18n } from '@/app/providers';
import { useLocation } from '@/app/contexts/LocationContext';
import { getPlaces } from '@/lib/api/client';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import PlacesMap from '@/components/PlacesMap';
import FilterSheet from '@/components/FilterSheet';
import type { Place, FilterOption } from '@/lib/types';

type ViewMode = 'list' | 'map';

function formatDistance(km: number): string {
  if (km === undefined) return '';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function PlaceCardUnified({ place, t }: { place: Place; t: (k: string) => string }) {
  return (
    <Link
      to={`/places/${place.place_code}`}
      className="group relative flex flex-col bg-white dark:bg-dark-surface rounded-3xl overflow-hidden shadow-soft hover:shadow-xl transition-all duration-500 hover:-translate-y-1 border border-slate-100 dark:border-dark-border"
    >
      <div className="relative h-48 overflow-hidden">
        {place.image_urls?.[0] ? (
          <img
            src={place.image_urls[0]}
            alt={place.name}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-slate-300">image</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

        {/* Floating Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          {place.is_open_now && (
            <span className="bg-emerald-500 text-white text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm">
              {t('places.openNow')}
            </span>
          )}
        </div>

        {place.distance != null && (
          <div className="absolute bottom-3 left-3 bg-white/20 backdrop-blur-md border border-white/30 rounded-full px-2.5 py-1">
            <span className="text-white text-[10px] font-bold">{formatDistance(place.distance)}</span>
          </div>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <div className="flex justify-between items-start gap-2 mb-1">
          <h3 className="font-bold text-slate-800 dark:text-white text-[15px] leading-tight truncate">
            {place.name}
          </h3>
          {place.average_rating != null && (
            <div className="flex items-center gap-0.5 shrink-0">
              <span className="material-symbols-outlined text-amber-400 text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
              <span className="text-[13px] font-bold text-slate-700 dark:text-slate-300">{place.average_rating.toFixed(1)}</span>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mb-3 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">location_on</span>
          {place.address || place.place_type}
        </p>

        <div className="mt-auto flex items-center justify-between pt-3 border-t border-slate-50 dark:border-dark-border">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
            {place.place_type}
          </span>
          <span className="text-primary group-hover:translate-x-1 transition-transform">
            <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { coords } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL synced state
  const search = searchParams.get('search') ?? '';
  const viewMode = (searchParams.get('view') as ViewMode) || 'list';

  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOption[]>([]);
  const [activeFilters, setActiveFilters] = useState<Record<string, boolean>>({});
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  const fetchPlaces = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getPlaces({
        religions: user?.religions?.length ? user.religions : undefined,
        search: search || undefined,
        sort: 'distance',
        limit: 50,
        lat: coords.lat,
        lng: coords.lng,
        open_now: activeFilters.open_now,
        has_parking: activeFilters.has_parking,
        womens_area: activeFilters.womens_area,
        has_events: activeFilters.has_events,
        top_rated: activeFilters.top_rated,
      });
      setPlaces(response.places);
      if (response.filters?.options) {
        setFilterOptions(response.filters.options);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  }, [user?.religions, search, activeFilters, coords, t]);

  useEffect(() => {
    const id = setTimeout(() => {
      fetchPlaces();
    }, 200);
    return () => clearTimeout(id);
  }, [fetchPlaces]);

  const handleSearchChange = (value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) newParams.set('search', value);
    else newParams.delete('search');
    setSearchParams(newParams);
  };

  const toggleViewMode = () => {
    const nextMode = viewMode === 'list' ? 'map' : 'list';
    const newParams = new URLSearchParams(searchParams);
    newParams.set('view', nextMode);
    setSearchParams(newParams);
  };

  const activeFiltersCount = Object.values(activeFilters).filter(Boolean).length;
  const displayName = user?.display_name?.trim() || user?.email?.split('@')[0] || t('home.title');

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-dark-bg">
      {/* Persistent Premium Header */}
      <header className="sticky top-0 z-[100] bg-white/80 dark:bg-dark-surface/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-dark-border px-4 py-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-5">
            <div>
              <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight leading-none">
                {t('home.greeting')} <span className="text-primary">{displayName}</span>
              </h1>
            </div>
            <button
              onClick={toggleViewMode}
              className="group flex items-center gap-2 bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border rounded-2xl px-4 py-2 shadow-soft hover:shadow-md transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-[20px] text-slate-600 dark:text-slate-300">
                {viewMode === 'list' ? 'map' : 'grid_view'}
              </span>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200 hidden sm:inline">
                {viewMode === 'list' ? t('home.map') : 'List View'}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-3 bg-slate-100 dark:bg-dark-bg border border-transparent focus-within:border-primary/30 focus-within:bg-white dark:focus-within:bg-dark-surface focus-within:shadow-lg focus-within:shadow-primary/5 rounded-2xl px-4 py-3 transition-all duration-300">
              <span className="material-symbols-outlined text-slate-400 text-[20px]">search</span>
              <input
                type="search"
                placeholder={t('home.findPlace')}
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="flex-1 bg-transparent border-none p-0 text-[15px] font-medium text-slate-800 dark:text-white placeholder:text-slate-400 focus:ring-0"
              />
            </div>
            <button
              onClick={() => setShowFilters(true)}
              className={`relative h-[48px] px-4 flex items-center justify-center rounded-2xl border transition-all duration-300 ${activeFiltersCount > 0
                ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20'
                : 'bg-white dark:bg-dark-surface border-slate-200 dark:border-dark-border text-slate-500 hover:text-primary'
                }`}
            >
              <span className="material-symbols-outlined text-[20px]">tune</span>
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center ring-2 ring-white dark:ring-dark-bg">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden">
        {viewMode === 'list' ? (
          <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
            {loading && places.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 gap-4">
                <div className="w-12 h-12 border-[3px] border-slate-200 border-t-primary rounded-full animate-spin" />
                <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">{t('home.loadingPlaces')}</p>
              </div>
            ) : error ? (
              <ErrorState message={error} onRetry={fetchPlaces} />
            ) : places.length === 0 ? (
              <EmptyState
                icon="search_off"
                title={t('home.noPlacesFound')}
                description={t('home.clearFilters')}
                action={
                  <button
                    onClick={() => { setActiveFilters({}); setSearchParams({}); }}
                    className="mt-4 px-6 py-3 bg-primary text-white font-bold rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all"
                  >
                    {t('home.clearFilters')}
                  </button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                {places.map((place) => (
                  <PlaceCardUnified key={place.place_code} place={place} t={t} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="h-full w-full absolute inset-0">
            <PlacesMap
              places={places}
              center={coords}
              onPlaceSelect={setSelectedPlace}
            />

            {/* Selection Card (Parity with Mobile App) */}
            {selectedPlace && (
              <div className="absolute bottom-10 left-4 right-4 z-[1000] animate-in slide-in-from-bottom-8 duration-300 max-w-lg mx-auto">
                <div className="bg-white/95 backdrop-blur-xl dark:bg-dark-surface/95 rounded-[2.5rem] shadow-2xl p-5 border border-white/50 dark:border-dark-border relative group">
                  <button
                    onClick={() => setSelectedPlace(null)}
                    className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-dark-bg rounded-full text-slate-400 hover:text-slate-600 transition-colors z-20"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>

                  <div className="flex gap-5">
                    <div className="w-28 h-28 rounded-3xl overflow-hidden shrink-0 shadow-lg">
                      {selectedPlace.image_urls?.[0] ? (
                        <img src={selectedPlace.image_urls[0]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-300">
                          <span className="material-symbols-outlined text-4xl">place</span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 flex flex-col pt-1 min-w-0">
                      <div className="mb-auto">
                        <h3 className="font-black text-slate-800 dark:text-white text-lg leading-tight truncate mb-1">
                          {selectedPlace.name}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium truncate mb-2">
                          {selectedPlace.address || selectedPlace.place_type}
                        </p>

                        <div className="flex items-center gap-3">
                          {selectedPlace.average_rating != null && (
                            <div className="flex items-center gap-1 text-amber-600 font-black text-xs bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-lg">
                              <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                              {selectedPlace.average_rating.toFixed(1)}
                            </div>
                          )}
                          {selectedPlace.distance != null && (
                            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-tight">
                              {formatDistance(selectedPlace.distance)} away
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-4">
                        <Link
                          to={`/places/${selectedPlace.place_code}`}
                          className="bg-primary text-white text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-2xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                          {t('places.detail')}
                        </Link>
                        <button className="w-10 h-10 flex items-center justify-center bg-slate-50 dark:bg-dark-bg rounded-2xl text-slate-500 hover:text-primary transition-colors">
                          <span className="material-symbols-outlined text-[20px]">share</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <FilterSheet
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        options={filterOptions}
        activeFilters={activeFilters}
        onApply={setActiveFilters}
      />
    </div>
  );
}
