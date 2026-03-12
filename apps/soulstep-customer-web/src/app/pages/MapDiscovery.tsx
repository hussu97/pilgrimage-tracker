import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PlaceMapView from '@/components/places/PlaceMapView';
import { getPlaces } from '@/lib/api/client';
import type { Place } from '@/lib/types';
import { useI18n } from '@/app/providers';
import { useLocation } from '@/app/contexts/LocationContext';
import { useHead } from '@/lib/hooks/useHead';

interface BoolFilter {
  key: 'open_now' | 'has_parking' | 'womens_area' | 'top_rated' | 'has_events';
  label: string;
  icon: string;
}

const BOOL_FILTERS: BoolFilter[] = [
  { key: 'open_now', label: 'Open Now', icon: 'schedule' },
  { key: 'top_rated', label: 'Top Rated', icon: 'star' },
  { key: 'has_parking', label: 'Parking', icon: 'local_parking' },
  { key: 'womens_area', label: "Women's Area", icon: 'wc' },
  { key: 'has_events', label: 'Events', icon: 'event' },
];

type ActiveFilters = Record<BoolFilter['key'], boolean>;

export default function MapDiscovery() {
  const { t } = useI18n();
  const { coords } = useLocation();
  const navigate = useNavigate();

  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ActiveFilters>({
    open_now: false,
    has_parking: false,
    womens_area: false,
    top_rated: false,
    has_events: false,
  });
  const [loading, setLoading] = useState(false);

  useHead({ title: t('map.fullScreen') || 'Explore Map' });

  const fetchPlaces = useCallback(async (searchVal: string, activeFilters: ActiveFilters) => {
    setLoading(true);
    try {
      const resp = await getPlaces({
        search: searchVal || undefined,
        limit: 200,
        open_now: activeFilters.open_now || undefined,
        has_parking: activeFilters.has_parking || undefined,
        womens_area: activeFilters.womens_area || undefined,
        top_rated: activeFilters.top_rated || undefined,
        has_events: activeFilters.has_events || undefined,
      });
      setPlaces(resp.places);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchPlaces('', {
      open_now: false,
      has_parking: false,
      womens_area: false,
      top_rated: false,
      has_events: false,
    });
  }, [fetchPlaces]);

  // Debounced re-fetch on search/filter change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPlaces(search, filters);
    }, 400);
    return () => clearTimeout(timer);
  }, [search, filters, fetchPlaces]);

  const toggleFilter = (key: BoolFilter['key']) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const activeCount = Object.values(filters).filter(Boolean).length;

  return (
    // Full-screen container
    // Desktop: flex layout with left panel + map filling remaining space
    <div className="fixed inset-0 z-0 w-full h-full lg:flex">
      {/* ── Desktop left panel (search + filters + places list) ── */}
      <div className="hidden lg:flex lg:flex-col lg:w-80 lg:shrink-0 lg:h-full lg:border-r lg:border-slate-200 dark:lg:border-dark-border bg-white dark:bg-dark-surface z-[700] pt-[64px]">
        {/* Search bar */}
        <div className="px-4 pt-4 pb-3 shrink-0">
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-dark-bg rounded-2xl border border-input-border dark:border-dark-border px-4 py-2.5">
            <span
              className="material-symbols-outlined text-[20px] text-slate-400 dark:text-dark-text-secondary shrink-0"
              aria-hidden
            >
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('search.placeholder') || 'Search sacred sites…'}
              className="flex-1 bg-transparent text-sm text-slate-700 dark:text-white placeholder:text-slate-400 dark:placeholder:text-dark-text-secondary outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="shrink-0 p-0.5 rounded-full hover:bg-slate-100 dark:hover:bg-dark-border transition-colors"
                aria-label="Clear search"
              >
                <span className="material-symbols-outlined text-[16px] text-slate-400 dark:text-dark-text-secondary">
                  close
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Filter pills — horizontal scrollable row, same as mobile */}
        <div className="px-4 pb-3 shrink-0">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {BOOL_FILTERS.map((f) => {
              const isActive = filters[f.key];
              return (
                <button
                  key={f.key}
                  onClick={() => toggleFilter(f.key)}
                  className={[
                    'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150',
                    isActive
                      ? 'bg-primary text-white shadow-md shadow-primary/30'
                      : 'bg-slate-100 dark:bg-dark-bg text-slate-600 dark:text-dark-text-secondary border border-slate-200 dark:border-dark-border hover:bg-slate-200 dark:hover:bg-dark-border',
                  ].join(' ')}
                >
                  <span
                    className="material-symbols-outlined text-[14px]"
                    aria-hidden
                    style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    {f.icon}
                  </span>
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Result count + active filter badge */}
          {!loading && (
            <div className="flex items-center gap-2 mt-2 px-1">
              <p className="text-xs text-slate-400 dark:text-dark-text-secondary">
                {places.length} {t('nav.places') || 'places'} {t('common.found') || 'found'}
              </p>
              {activeCount > 0 && (
                <button
                  onClick={() =>
                    setFilters({
                      open_now: false,
                      has_parking: false,
                      womens_area: false,
                      top_rated: false,
                      has_events: false,
                    })
                  }
                  className="text-xs text-primary font-semibold hover:underline"
                >
                  {t('common.clear') || 'Clear'}
                </button>
              )}
            </div>
          )}
          {loading && (
            <p className="text-xs text-slate-400 dark:text-dark-text-secondary mt-2 px-1">
              {t('common.loading') || 'Loading…'}
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-slate-100 dark:bg-dark-border shrink-0 mx-4" />

        {/* Places list — scrollable */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {places.map((place) => {
            const isSelected = selectedPlace?.place_code === place.place_code;
            const imageUrl = place.images?.[0]?.url;
            return (
              <button
                key={place.place_code}
                onClick={() => setSelectedPlace(isSelected ? null : place)}
                className={[
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-left transition-all duration-150',
                  isSelected
                    ? 'bg-primary/10 dark:bg-primary/15'
                    : 'hover:bg-slate-50 dark:hover:bg-dark-bg',
                ].join(' ')}
              >
                {/* Thumbnail */}
                <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-slate-100 dark:bg-dark-bg flex items-center justify-center">
                  {imageUrl ? (
                    <img src={imageUrl} alt={place.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="material-icons text-[18px] text-slate-400 dark:text-dark-text-secondary">
                      place
                    </span>
                  )}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-semibold truncate ${isSelected ? 'text-primary' : 'text-slate-800 dark:text-white'}`}
                  >
                    {place.name}
                  </p>
                  {place.address && (
                    <p className="text-xs text-slate-400 dark:text-dark-text-secondary truncate mt-0.5">
                      {place.address}
                    </p>
                  )}
                </div>

                {/* Open badge */}
                {place.is_open_now && (
                  <span className="shrink-0 w-2 h-2 rounded-full bg-green-500" title="Open" />
                )}
              </button>
            );
          })}

          {!loading && places.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <span className="material-icons text-4xl text-slate-300 dark:text-dark-border mb-2">
                search_off
              </span>
              <p className="text-sm text-slate-400 dark:text-dark-text-secondary">
                {t('search.noResults') || 'No places found'}
              </p>
            </div>
          )}

          {/* Navigate to place detail on double-click / explicit tap */}
          {selectedPlace && (
            <div className="sticky bottom-0 bg-white dark:bg-dark-surface pt-2 pb-3 border-t border-slate-100 dark:border-dark-border mt-2">
              <div className="px-1">
                <p className="text-xs font-bold text-primary mb-1 truncate">{selectedPlace.name}</p>
                <button
                  onClick={() => navigate(`/places/${selectedPlace.place_code}`)}
                  className="w-full py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
                >
                  {t('place.viewDetails') || 'View Details'} →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Map fills remaining space on desktop, full-screen on mobile ── */}
      <div className="flex-1 relative w-full h-full">
        <PlaceMapView
          places={places}
          center={coords}
          selectedPlace={selectedPlace}
          onPlaceSelect={setSelectedPlace}
          t={t}
          isVisible
          mapLoading={loading}
        />

        {/* Mobile floating search + filter overlay (hidden on desktop) */}
        <div className="lg:hidden absolute top-0 left-0 right-0 z-[700] pointer-events-none">
          <div className="pointer-events-auto mx-auto max-w-lg px-4 pt-3 md:pt-[64px] flex flex-col gap-2">
            {/* Search bar */}
            <div className="flex items-center gap-2 bg-white/90 dark:bg-dark-surface/90 backdrop-blur-xl rounded-2xl shadow-lg border border-input-border/60 dark:border-dark-border px-4 py-2.5">
              <span
                className="material-symbols-outlined text-[20px] text-slate-400 dark:text-dark-text-secondary shrink-0"
                aria-hidden
              >
                search
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('search.placeholder') || 'Search sacred sites…'}
                className="flex-1 bg-transparent text-sm text-slate-700 dark:text-white placeholder:text-slate-400 dark:placeholder:text-dark-text-secondary outline-none"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="shrink-0 p-0.5 rounded-full hover:bg-slate-100 dark:hover:bg-dark-border transition-colors"
                  aria-label="Clear search"
                >
                  <span className="material-symbols-outlined text-[16px] text-slate-400 dark:text-dark-text-secondary">
                    close
                  </span>
                </button>
              )}
            </div>

            {/* Bool filter chips */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {BOOL_FILTERS.map((f) => {
                const isActive = filters[f.key];
                return (
                  <button
                    key={f.key}
                    onClick={() => toggleFilter(f.key)}
                    className={[
                      'shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150',
                      isActive
                        ? 'bg-primary text-white shadow-md shadow-primary/30'
                        : 'bg-white/85 dark:bg-dark-surface/85 backdrop-blur text-slate-600 dark:text-dark-text-secondary border border-input-border/50 dark:border-dark-border hover:bg-white dark:hover:bg-dark-surface',
                    ].join(' ')}
                  >
                    <span
                      className="material-symbols-outlined text-[14px]"
                      aria-hidden
                      style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                    >
                      {f.icon}
                    </span>
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
