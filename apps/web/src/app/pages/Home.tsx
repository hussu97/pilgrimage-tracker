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
type FilterChip = 'nearby' | 'historical' | 'jummah' | 'events' | '';

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

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
  const [filter, setFilter] = useState<FilterChip>('nearby');

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
    // Jummah/Events: add when backend supports (e.g. jummah=true, has_events=true)
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

  const displayName = user?.display_name?.trim() || user?.email?.split('@')[0] || t('home.title');
  const heroPlace = places.length > 0 ? places[0] : null;
  const restPlaces = places.slice(1);

  return (
    <div
      className="min-h-full antialiased font-sans"
      style={{ background: 'linear-gradient(180deg, #F0F7FF 0%, #FFFFFF 100%)' }}
    >
      <div className="px-4 md:px-6 pb-6 max-w-4xl mx-auto">
        <header className="mb-8">
          <div className="flex justify-between items-start mb-8">
            <div>
              <p className="text-xs text-primary-dark font-medium tracking-[0.2em] uppercase mb-2">
                {t('nav.explore')}
              </p>
              <h1 className="text-3xl font-light text-slate-800 tracking-tight leading-tight">
                <span className="font-extralight text-slate-500 block text-2xl mb-1">
                  {t('home.greeting')}
                </span>
                <span className="font-normal text-slate-900">{displayName}</span>
              </h1>
            </div>
            <div
              className="bg-white/50 backdrop-blur-sm p-1 rounded-full flex items-center border border-white shadow-sm"
              role="group"
              aria-label={`${t('home.list')} / ${t('home.map')}`}
            >
              <button
                type="button"
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
                aria-label={t('home.list')}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                  viewMode === 'list' ? 'bg-primary text-white shadow-md' : 'text-slate-400 hover:text-primary'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">list</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('map')}
                aria-pressed={viewMode === 'map'}
                aria-label={t('home.map')}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                  viewMode === 'map' ? 'bg-primary text-white shadow-md' : 'text-slate-400 hover:text-primary'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">map</span>
              </button>
            </div>
          </div>

          <div className="relative group mb-8">
            <div className="flex items-center border-b border-slate-200 focus-within:border-primary transition-colors pb-2">
              <span className="material-symbols-outlined text-slate-400 text-xl mr-3 font-light">
                search
              </span>
              <input
                type="search"
                aria-label={t('home.findPlace')}
                placeholder={t('home.findPlace')}
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="flex-1 bg-transparent border-none p-0 text-lg font-light text-slate-800 placeholder-slate-300 focus:ring-0 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex gap-3 overflow-x-auto no-scrollbar py-2">
            {(['nearby', 'historical', 'jummah', 'events'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter((f) => (f === key ? 'nearby' : key))}
                aria-pressed={filter === key}
                className={`whitespace-nowrap px-5 py-2.5 rounded-xl text-sm font-light shadow-sm transition-colors ${
                  filter === key
                    ? 'bg-slate-900 text-white shadow-lg shadow-slate-200'
                    : 'bg-white/60 backdrop-blur-sm border border-white text-slate-500 hover:bg-white'
                }`}
              >
                {t(`home.${key}`)}
              </button>
            ))}
          </div>
        </header>

        {viewMode === 'map' && (
          <>
            {loading && (
              <div className="py-8 text-center text-slate-500 border border-dashed border-slate-200 rounded-2xl bg-white/50">
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
                description={search || filter !== 'nearby' ? t('home.clearFilters') : undefined}
                action={
                  <Link
                    to="/home"
                    className="inline-block py-2 px-4 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover"
                  >
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
              <p className="text-slate-500 py-8">{t('home.loadingPlaces')}</p>
            )}
            {error && (
              <ErrorState message={error} onRetry={fetchPlaces} retryLabel={t('common.retry')} />
            )}
            {!loading && !error && places.length === 0 && (
              <EmptyState
                icon="explore"
                title={t('home.noPlacesFound')}
                description={search || filter !== 'nearby' ? t('home.clearFilters') : undefined}
                action={
                  <Link
                    to="/home"
                    className="inline-block py-2 px-4 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover"
                  >
                    {t('home.explorePlaces')}
                  </Link>
                }
              />
            )}
            {!loading && !error && places.length > 0 && (
              <div className="space-y-8">
                {/* Hero place card */}
                <Link
                  to={`/places/${heroPlace!.place_code}`}
                  className="block rounded-[2rem] overflow-hidden shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] group cursor-pointer relative h-[28rem] w-full transform transition-all duration-300 hover:shadow-xl"
                >
                  <div className="absolute inset-0">
                    {heroPlace!.image_urls?.[0] ? (
                      <img
                        src={heroPlace!.image_urls[0]}
                        alt=""
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full bg-soft-blue flex items-center justify-center">
                        <span className="material-symbols-outlined text-6xl text-slate-400">
                          place
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/80" />
                  </div>
                  {heroPlace!.user_has_checked_in && (
                    <div className="absolute top-5 right-5 z-10">
                      <span className="inline-flex items-center gap-1 bg-white/20 backdrop-blur-md border border-white/30 rounded-full px-3 py-1 text-[10px] font-medium text-white uppercase tracking-wider">
                        <span className="material-symbols-outlined text-[14px]">check</span>
                        {t('places.visited')}
                      </span>
                    </div>
                  )}
                  {heroPlace!.is_open_now && (
                    <div className="absolute top-5 left-5 z-10">
                      <span className="inline-flex items-center gap-1 bg-emerald-500/20 backdrop-blur-md border border-emerald-400/30 rounded-full px-3 py-1 text-[10px] font-medium text-white uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {t('places.openNow')}
                      </span>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-6 text-white z-10">
                    <div className="rounded-2xl p-5 border-t border-white/20 bg-white/15 backdrop-blur-md border border-white/30">
                      <div className="flex justify-between items-end mb-2">
                        <div>
                          <h3 className="text-2xl font-semibold leading-tight mb-1" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                            {heroPlace!.name}
                          </h3>
                          <p className="text-sm text-white/90 font-light flex items-center">
                            <span className="material-symbols-outlined text-white/80 text-sm mr-1">
                              location_on
                            </span>
                            {heroPlace!.address || heroPlace!.place_type || ''}
                          </p>
                        </div>
                        {heroPlace!.average_rating != null && (
                          <div className="text-right">
                            <span className="block text-2xl font-light">
                              {heroPlace!.average_rating.toFixed(1)}
                            </span>
                            <div className="flex text-yellow-400 text-[10px]">
                              {[1, 2, 3, 4, 5].map((i) => (
                                <span key={i} className="material-symbols-outlined text-[12px]">
                                  star
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/20">
                        {heroPlace!.distance != null && (
                          <span className="text-xs font-light tracking-wide text-white/80 uppercase">
                            {formatDistance(heroPlace!.distance)} away
                          </span>
                        )}
                        <span className="text-xs font-medium text-white hover:text-accent transition-colors uppercase tracking-widest flex items-center gap-1">
                          {t('home.details')}{' '}
                          <span className="material-symbols-outlined text-sm">arrow_forward</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>

                {/* Rest of places */}
                <div className="space-y-6 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4 md:space-y-0">
                  {restPlaces.map((place) => (
                    <PlaceCard key={place.place_code} place={place} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
