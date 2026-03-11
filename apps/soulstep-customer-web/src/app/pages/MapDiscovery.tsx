import { useState, useEffect, useCallback } from 'react';
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

  return (
    // Full-screen container: position relative so overlay children can be absolute
    // Desktop: flex layout with left panel + map filling remaining space
    <div className="fixed inset-0 z-0 w-full h-full lg:flex">
      {/* ── Desktop left panel (filters + search) ── */}
      <div className="hidden lg:flex lg:flex-col lg:w-80 lg:shrink-0 lg:h-full lg:overflow-y-auto lg:border-r lg:border-slate-200 dark:lg:border-dark-border bg-white dark:bg-dark-surface z-[700] pt-[64px]">
        <div className="p-4 flex flex-col gap-3 flex-1">
          {/* Search bar */}
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

          {/* Bool filter chips — vertical on desktop */}
          <div className="flex flex-col gap-1.5">
            {BOOL_FILTERS.map((f) => {
              const isActive = filters[f.key];
              return (
                <button
                  key={f.key}
                  onClick={() => toggleFilter(f.key)}
                  className={[
                    'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 text-left',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-slate-600 dark:text-dark-text-secondary hover:bg-slate-50 dark:hover:bg-dark-bg',
                  ].join(' ')}
                >
                  <span
                    className="material-symbols-outlined text-[18px]"
                    aria-hidden
                    style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    {f.icon}
                  </span>
                  {f.label}
                  {isActive && <span className="ml-auto w-2 h-2 rounded-full bg-primary" />}
                </button>
              );
            })}
          </div>

          {/* Place count */}
          {!loading && (
            <p className="text-xs text-slate-400 dark:text-dark-text-secondary mt-2 px-1">
              {places.length} {t('nav.places').toLowerCase()} {t('common.found') || 'found'}
            </p>
          )}

          {/* Vertical place list */}
          {selectedPlace && (
            <div className="mt-2 p-3 rounded-2xl border border-primary/20 bg-primary/5 dark:bg-primary/10">
              <p className="text-xs font-bold text-primary mb-1">
                {t('common.selected') || 'Selected'}
              </p>
              <p className="text-sm font-semibold text-slate-800 dark:text-white">
                {selectedPlace.name}
              </p>
              {selectedPlace.address && (
                <p className="text-xs text-slate-500 dark:text-dark-text-secondary mt-0.5">
                  {selectedPlace.address}
                </p>
              )}
              <button
                onClick={() => setSelectedPlace(null)}
                className="mt-2 text-xs text-primary font-semibold"
              >
                {t('common.close') || 'Clear'}
              </button>
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
