import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth, useI18n } from '@/app/providers';
import { useLocation } from '@/app/contexts/LocationContext';
import { getPlaces } from '@/lib/api/client';
import FilterSheet from '@/components/places/FilterSheet';
import HomeHeader from '@/components/places/HomeHeader';
import PlaceListView from '@/components/places/PlaceListView';
import PlaceMapView from '@/components/places/PlaceMapView';
import type { Place, FilterOption } from '@/lib/types';

type ViewMode = 'list' | 'map';

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

  const handleClearFilters = () => {
    setActiveFilters({});
    setSearchParams({});
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-dark-bg">
      <HomeHeader
        displayName={displayName}
        viewMode={viewMode}
        search={search}
        activeFiltersCount={activeFiltersCount}
        onSearchChange={handleSearchChange}
        onViewModeToggle={toggleViewMode}
        onFilterClick={() => setShowFilters(true)}
        t={t}
      />

      <main className="flex-1 relative overflow-hidden">
        {viewMode === 'list' ? (
          <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
            <PlaceListView
              places={places}
              loading={loading}
              error={error}
              onRetry={fetchPlaces}
              onClearFilters={handleClearFilters}
              t={t}
            />
          </div>
        ) : (
          <PlaceMapView
            places={places}
            center={coords}
            selectedPlace={selectedPlace}
            onPlaceSelect={setSelectedPlace}
            t={t}
          />
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
