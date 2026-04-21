'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import PlaceCardUnified from '@/components/places/PlaceCardUnified';
import PlaceMapView from '@/components/places/PlaceMapView';
import { getPlaces } from '@/lib/api/client';
import type { Place } from '@/lib/types';
import type { MapBounds } from '@/components/places/PlacesMap';
import { useI18n } from '@/app/providers';
import { useLocation } from '@/app/contexts/LocationContext';
import { useHead } from '@/lib/hooks/useHead';
import { useUmamiTracking } from '@/lib/hooks/useUmamiTracking';
import { EVENTS } from '@/lib/analytics/events';

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
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  // Track latest bounds in a ref so the debounced fetch always uses the current value
  const boundsRef = useRef<MapBounds | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useHead({ title: t('map.fullScreen') || 'Explore Map' });

  const fetchPlaces = useCallback(
    async (searchVal: string, activeFilters: ActiveFilters, bounds: MapBounds | null) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const resp = await getPlaces(
          {
            search: searchVal || undefined,
            page_size: 100,
            open_now: activeFilters.open_now || undefined,
            has_parking: activeFilters.has_parking || undefined,
            womens_area: activeFilters.womens_area || undefined,
            top_rated: activeFilters.top_rated || undefined,
            has_events: activeFilters.has_events || undefined,
            // Only apply bbox when we have actual viewport bounds
            min_lat: bounds?.south,
            max_lat: bounds?.north,
            min_lng: bounds?.west,
            max_lng: bounds?.east,
          },
          controller.signal,
        );
        setPlaces(resp.places);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // ignore other errors
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [],
  );

  // Abort in-flight request on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Refetch when search or filters change (uses latest bounds via ref)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPlaces(search, filters, boundsRef.current);
    }, 400);
    return () => clearTimeout(timer);
  }, [search, filters, fetchPlaces]);

  // Refetch when the viewport moves (debounced to avoid spamming on drag)
  useEffect(() => {
    if (!mapBounds) return;
    boundsRef.current = mapBounds;
    const timer = setTimeout(() => {
      fetchPlaces(search, filters, mapBounds);
    }, 600);
    return () => clearTimeout(timer);
  }, [mapBounds, search, filters, fetchPlaces]);

  const { trackUmamiEvent } = useUmamiTracking();

  // Debounce map pan events so a single drag doesn't fire 30 events.
  const lastPanRef = useRef<number>(0);
  const handleBoundsChange = useCallback(
    (bounds: MapBounds) => {
      setMapBounds(bounds);
      const now = Date.now();
      if (now - lastPanRef.current > 2000) {
        lastPanRef.current = now;
        trackUmamiEvent(EVENTS.discover.map_pan);
      }
    },
    [trackUmamiEvent],
  );

  const toggleFilter = (key: BoolFilter['key']) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      trackUmamiEvent(EVENTS.discover.filter_toggle, {
        source: 'map',
        filter: key,
        active: next[key],
      });
      return next;
    });
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

        {/* Places list — scrollable, same cards as the map panel */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
          {places.map((place) => (
            <div
              key={place.place_code}
              onClick={() =>
                setSelectedPlace(selectedPlace?.place_code === place.place_code ? null : place)
              }
              className="cursor-pointer"
            >
              <PlaceCardUnified
                place={place}
                t={t}
                onCardClick={(p) =>
                  trackUmamiEvent(EVENTS.discover.place_card_click, {
                    source: 'map',
                    place_code: p.place_code,
                  })
                }
              />
            </div>
          ))}

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
          skipAutoFit
          onBoundsChange={handleBoundsChange}
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
