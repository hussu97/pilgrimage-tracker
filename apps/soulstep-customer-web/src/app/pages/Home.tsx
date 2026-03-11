import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth, useI18n } from '@/app/providers';
import { useDocumentTitle } from '@/lib/hooks/useDocumentTitle';
import { useUmamiTracking } from '@/lib/hooks/useUmamiTracking';
import { useLocation } from '@/app/contexts/LocationContext';
import { getPlaces } from '@/lib/api/client';
import FilterSheet from '@/components/places/FilterSheet';
import HomeHeader from '@/components/places/HomeHeader';
import PlaceListView from '@/components/places/PlaceListView';
import PlaceMapView from '@/components/places/PlaceMapView';
import SearchOverlay from '@/components/search/SearchOverlay';
import type { MapBounds } from '@/components/places/PlacesMap';
import type { Place, FilterOption } from '@/lib/types';
import type { SearchLocation } from '@/lib/utils/searchHistory';

type ViewMode = 'list' | 'map';

const PAGE_SIZE = 20;
const MAP_PAGE_SIZE = 200;

export default function Home() {
  useDocumentTitle();
  const { user } = useAuth();
  const { t } = useI18n();
  const { coords } = useLocation();
  const { trackUmamiEvent } = useUmamiTracking();
  const [searchParams, setSearchParams] = useSearchParams();

  const viewMode = (searchParams.get('view') as ViewMode) || 'list';

  // ── Restored map position from URL ───────────────────────────────────────
  const mlat = searchParams.get('mlat');
  const mlng = searchParams.get('mlng');
  const mz = searchParams.get('mz');
  const initMapCenter = useMemo(
    () => (mlat && mlng ? { lat: +mlat, lng: +mlng } : undefined),
    // Only compute once on mount — URL params are written by the map itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const initMapZoom = useMemo(
    () => (mz ? +mz : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const hasSavedMapPos = initMapCenter != null && initMapZoom != null;

  // ── List-view state (cursor-paginated, 20/page) ──────────────────────────
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const nextCursorRef = useRef<string | null>(null);

  // ── Map-view state (viewport-fetched, up to 200) ─────────────────────────
  const [mapPlaces, setMapPlaces] = useState<Place[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [showSearchArea, setShowSearchArea] = useState(false);
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const mapBoundsRef = useRef<MapBounds | null>(null);
  const initialMapFetchDone = useRef(false);

  // ── Shared state ──────────────────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOption[]>([]);
  const [activeFilters, setActiveFilters] = useState<Record<string, boolean>>({});
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [searchLocation, setSearchLocation] = useState<SearchLocation | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const mapMoveTimerRef = useRef<number | null>(null);

  // ── Shared base params (no cursor, no limit, no bbox) ────────────────────
  const buildBaseParams = useCallback(() => {
    const religions = (() => {
      const r = user?.religions ?? [];
      if (!r.length || r.includes('all')) return undefined;
      return r;
    })();
    return {
      religions,
      sort: 'distance' as const,
      lat: searchLocation ? searchLocation.lat : coords.lat,
      lng: searchLocation ? searchLocation.lng : coords.lng,
      open_now: activeFilters.open_now,
      has_parking: activeFilters.has_parking,
      womens_area: activeFilters.womens_area,
      has_events: activeFilters.has_events,
      top_rated: activeFilters.top_rated,
    };
  }, [user?.religions, activeFilters, coords, searchLocation]);

  // ── List-view fetch (cursor-paginated) ────────────────────────────────────
  const buildListParams = useCallback(
    (cursor: string | null) => ({
      ...buildBaseParams(),
      limit: PAGE_SIZE,
      cursor: cursor ?? undefined,
      radius: searchLocation ? 10 : undefined,
    }),
    [buildBaseParams, searchLocation],
  );

  const fetchPlaces = useCallback(async () => {
    setLoading(true);
    setError('');
    setHasMore(true);
    try {
      const response = await getPlaces(buildListParams(null));
      setPlaces(response.places);
      nextCursorRef.current = response.next_cursor ?? null;
      setHasMore(response.next_cursor != null);
      if (response.filters?.options) {
        setFilterOptions(response.filters.options);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  }, [buildListParams, t]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      const response = await getPlaces(buildListParams(nextCursorRef.current));
      if (response.places.length > 0) {
        setPlaces((prev) => [...prev, ...response.places]);
        nextCursorRef.current = response.next_cursor ?? null;
      }
      setHasMore(response.next_cursor != null);
    } catch {
      // silently skip
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, loading, buildListParams]);

  // ── Map-view fetch (viewport bounding box) ────────────────────────────────
  const fetchMapPlaces = useCallback(
    async (bounds: MapBounds) => {
      setMapLoading(true);
      try {
        const response = await getPlaces({
          ...buildBaseParams(),
          min_lat: bounds.south,
          max_lat: bounds.north,
          min_lng: bounds.west,
          max_lng: bounds.east,
          limit: MAP_PAGE_SIZE,
        });
        setMapPlaces(response.places);
        if (response.filters?.options) {
          setFilterOptions(response.filters.options);
        }
      } catch {
        // Keep previous map places on error
      } finally {
        setMapLoading(false);
      }
    },
    [buildBaseParams],
  );

  // Auto-fetch list when params change
  useEffect(() => {
    const id = setTimeout(() => {
      fetchPlaces();
    }, 200);
    return () => clearTimeout(id);
  }, [fetchPlaces]);

  // Initial map fetch — runs once when the map first reports bounds
  useEffect(() => {
    if (mapBounds && !initialMapFetchDone.current) {
      initialMapFetchDone.current = true;
      fetchMapPlaces(mapBounds);
    }
  }, [mapBounds, fetchMapPlaces]);

  // Auto-refetch map when filters or search change (if we have bounds)
  const prevBaseParamsRef = useRef<string>('');
  useEffect(() => {
    const key = JSON.stringify(buildBaseParams());
    if (prevBaseParamsRef.current && prevBaseParamsRef.current !== key && mapBoundsRef.current) {
      setShowSearchArea(false);
      fetchMapPlaces(mapBoundsRef.current);
    }
    prevBaseParamsRef.current = key;
  }, [buildBaseParams, fetchMapPlaces]);

  // ── Map bounds change → show "Search this area" button ────────────────────
  const handleBoundsChange = useCallback((bounds: MapBounds) => {
    setMapBounds(bounds);
    mapBoundsRef.current = bounds;
    // Show button only after the initial fetch is done (user has panned)
    if (initialMapFetchDone.current) {
      setShowSearchArea(true);
    }
  }, []);

  const handleSearchArea = useCallback(() => {
    if (mapBoundsRef.current) {
      setShowSearchArea(false);
      fetchMapPlaces(mapBoundsRef.current);
    }
  }, [fetchMapPlaces]);

  // ── Debounced map move → write mlat/mlng/mz to URL ───────────────────────
  const handleMapMove = useCallback(
    (lat: number, lng: number, zoom: number) => {
      if (mapMoveTimerRef.current) clearTimeout(mapMoveTimerRef.current);
      mapMoveTimerRef.current = window.setTimeout(() => {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set('mlat', lat.toFixed(5));
            next.set('mlng', lng.toFixed(5));
            next.set('mz', String(zoom));
            return next;
          },
          { replace: true },
        );
      }, 500);
    },
    [setSearchParams],
  );

  // ── Recenter map to user location ─────────────────────────────────────────
  const handleRecenter = useCallback(() => {
    // Trigger re-center by updating the PlacesMap via a search-location-like flow
    // The simplest approach: clear search + saved position so map re-fits to user coords
    setSearchLocation(null);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('mlat');
        next.delete('mlng');
        next.delete('mz');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const toggleViewMode = () => {
    const nextMode = viewMode === 'list' ? 'map' : 'list';
    const newParams = new URLSearchParams(searchParams);
    newParams.set('view', nextMode);
    setSearchParams(newParams);
    trackUmamiEvent('view_mode_change', { mode: nextMode });
  };

  const activeFiltersCount = Object.values(activeFilters).filter(Boolean).length;
  const displayName = user?.display_name?.trim() || user?.email?.split('@')[0] || t('home.title');

  const handleClearFilters = () => {
    setActiveFilters({});
    setSearchParams({});
  };

  const handleSearchSelect = (loc: SearchLocation) => {
    setSearchLocation(loc);
    setShowSearch(false);
    trackUmamiEvent('search', { query: loc.name });
    // Clear saved map position so the map re-fits to the new search area
    initialMapFetchDone.current = false;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('mlat');
        next.delete('mlng');
        next.delete('mz');
        return next;
      },
      { replace: true },
    );
  };

  const handleClearSearch = () => {
    setSearchLocation(null);
    // Clear saved map position so the map re-fits to the new default area
    initialMapFetchDone.current = false;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('mlat');
        next.delete('mlng');
        next.delete('mz');
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-dark-bg">
      <HomeHeader
        displayName={displayName}
        viewMode={viewMode}
        searchLocation={searchLocation}
        activeFiltersCount={activeFiltersCount}
        onSearchClick={() => setShowSearch(true)}
        onClearSearch={handleClearSearch}
        onViewModeToggle={toggleViewMode}
        onFilterClick={() => setShowFilters(true)}
        t={t}
      />

      <main className="flex-1 relative overflow-hidden">
        {/* Both views stay mounted so Leaflet is never re-initialized */}
        <div className={viewMode === 'list' ? 'max-w-7xl mx-auto px-4 py-6 sm:px-6' : 'hidden'}>
          <PlaceListView
            places={places}
            loading={loading}
            loadingMore={loadingMore}
            hasMore={hasMore}
            error={error}
            onRetry={fetchPlaces}
            onLoadMore={loadMore}
            onClearFilters={handleClearFilters}
            t={t}
          />
        </div>
        <div className={viewMode === 'map' ? 'h-full w-full absolute inset-0' : 'hidden'}>
          <PlaceMapView
            places={mapPlaces}
            center={coords}
            searchLocation={searchLocation}
            selectedPlace={selectedPlace}
            onPlaceSelect={setSelectedPlace}
            t={t}
            isVisible={viewMode === 'map'}
            initMapCenter={initMapCenter}
            initMapZoom={initMapZoom}
            skipAutoFit={hasSavedMapPos}
            onMapMove={handleMapMove}
            mapLoading={mapLoading}
            showSearchArea={showSearchArea}
            onSearchArea={handleSearchArea}
            onRecenter={handleRecenter}
            onBoundsChange={handleBoundsChange}
          />
        </div>
      </main>

      <FilterSheet
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        options={filterOptions}
        activeFilters={activeFilters}
        onApply={(filters) => {
          setActiveFilters(filters);
          trackUmamiEvent('filter_apply', { count: Object.values(filters).filter(Boolean).length });
        }}
      />

      {showSearch && (
        <SearchOverlay
          onSelect={handleSearchSelect}
          onClose={() => setShowSearch(false)}
          userLat={coords.lat}
          userLng={coords.lng}
          t={t}
        />
      )}
    </div>
  );
}
