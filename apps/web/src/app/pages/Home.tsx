import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/app/providers';
import { useI18n } from '@/app/providers';
import { useLocation } from '@/app/contexts/LocationContext';
import { getPlaces } from '@/lib/api/client';
import PlaceCard from '@/components/PlaceCard';
import PlacesMap from '@/components/PlacesMap';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import type { Place } from '@/lib/types';

type ViewMode = 'list' | 'map';
type FilterChip = 'nearby' | 'historical' | '';

export default function Home() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { coords } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filter, setFilter] = useState<FilterChip>('');

  const fetchPlaces = useCallback(async () => {
    setLoading(true);
    setError('');
    const params: Parameters<typeof getPlaces>[0] = {
      religions: user?.religions?.length ? user.religions : undefined,
      search: search || undefined,
      sort: 'distance',
      limit: 50,
      lat: coords.lat,
      lng: coords.lng,
    };
    if (filter === 'historical') params.place_type = 'temple';
    try {
      const data = await getPlaces(params);
      setPlaces(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  }, [user?.religions, search, filter, coords, t]);

  useEffect(() => {
    fetchPlaces();
  }, [fetchPlaces]);

  const handleSearchChange = (value: string) => {
    if (value) setSearchParams({ search: value });
    else setSearchParams({});
  };

  const displayName = user?.display_name?.trim() || user?.email?.split('@')[0] || '';

  return (
    <div className="px-4 md:px-6 pb-6 max-w-4xl mx-auto">
      <header className="mb-6">
        <div className="flex justify-between items-end mb-4">
          <div>
            <p className="text-sm text-primary font-medium tracking-wide uppercase mb-1">{t('nav.explore')}</p>
            <h1 className="text-2xl font-semibold leading-tight text-text-main">
              {displayName ? `Welcome, ${displayName}` : t('home.title')}
            </h1>
          </div>
          <div className="bg-gray-100 dark:bg-gray-700 p-1 rounded-full flex items-center border border-gray-200 dark:border-gray-600" role="group" aria-label={`${t('home.list')} / ${t('home.map')}`}>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              aria-label={t('home.list')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                viewMode === 'list'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-muted hover:text-primary'
              }`}
            >
              <span className="material-symbols-outlined text-sm" aria-hidden>list</span>
              {t('home.list')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('map')}
              aria-pressed={viewMode === 'map'}
              aria-label={t('home.map')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                viewMode === 'map'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-muted hover:text-primary'
              }`}
            >
              <span className="material-symbols-outlined text-sm" aria-hidden>map</span>
              {t('home.map')}
            </button>
          </div>
        </div>

        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted" aria-hidden>
            <span className="material-symbols-outlined">search</span>
          </span>
          <input
            type="search"
            aria-label={t('home.findPlace')}
            placeholder={t('home.findPlace')}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="block w-full pl-10 pr-3 py-3 border border-input-border rounded-xl bg-background-light dark:bg-gray-800 text-text-main placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
          />
        </div>

        <div className="flex gap-3 mt-4 overflow-x-auto pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setFilter((f) => (f === 'nearby' ? '' : 'nearby'))}
            aria-pressed={filter === 'nearby'}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
              filter === 'nearby'
                ? 'bg-primary text-white border-primary'
                : 'bg-white dark:bg-gray-800 border-input-border text-text-muted hover:border-primary/50 hover:text-primary'
            }`}
          >
            {t('home.nearby')}
          </button>
          <button
            type="button"
            onClick={() => setFilter((f) => (f === 'historical' ? '' : 'historical'))}
            aria-pressed={filter === 'historical'}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
              filter === 'historical'
                ? 'bg-primary text-white border-primary'
                : 'bg-white dark:bg-gray-800 border-input-border text-text-muted hover:border-primary/50 hover:text-primary'
            }`}
          >
            Historical
          </button>
        </div>
      </header>

      {viewMode === 'map' && (
        <>
          {loading && (
            <div className="py-8 text-center text-text-muted border border-dashed border-input-border rounded-2xl bg-gray-50 dark:bg-gray-800/50">
              <span className="material-symbols-outlined text-4xl mb-2">map</span>
              <p>{t('common.loading')}</p>
            </div>
          )}
          {error && (
            <ErrorState message={error} onRetry={fetchPlaces} retryLabel={t('common.retry')} />
          )}
          {!loading && !error && places.length === 0 && (
            <EmptyState
              icon="map"
              title={t('home.noPlacesFound')}
              description={search || filter ? t('home.clearFilters') : undefined}
              action={
                <Link to="/home" className="inline-block py-2 px-4 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                  {t('home.explorePlaces')}
                </Link>
              }
            />
          )}
          {!loading && !error && places.length > 0 && (
            <PlacesMap places={places} center={coords} />
          )}
        </>
      )}

      {viewMode === 'list' && (
        <>
          {loading && (
            <p className="text-text-muted py-8">{t('home.loadingPlaces')}</p>
          )}
          {error && (
            <ErrorState message={error} onRetry={fetchPlaces} retryLabel={t('common.retry')} />
          )}
          {!loading && !error && places.length === 0 && (
            <EmptyState
              icon="explore"
              title={t('home.noPlacesFound')}
              description={search || filter ? t('home.clearFilters') : undefined}
              action={
                <Link to="/home" className="inline-block py-2 px-4 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                  {t('home.explorePlaces')}
                </Link>
              }
            />
          )}
          {!loading && !error && places.length > 0 && (
            <div className="space-y-6 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
              {places.map((place) => (
                <PlaceCard key={place.place_code} place={place} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
