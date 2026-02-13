import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/app/providers';
import { useI18n } from '@/app/providers';
import { useLocation } from '@/app/contexts/LocationContext';
import { getPlaces } from '@/lib/api/client';
import { shareUrl } from '@/lib/share';
import PlacesMap from '@/components/PlacesMap';
import ErrorState from '@/components/ErrorState';
import type { Place } from '@/lib/types';

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export default function Map() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { coords } = useLocation();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  const fetchPlaces = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getPlaces({
        religions: user?.religions?.length ? user.religions : undefined,
        search: search || undefined,
        sort: 'distance',
        limit: 100,
        lat: coords.lat,
        lng: coords.lng,
      });
      setPlaces(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  }, [user?.religions, coords, search, t]);

  useEffect(() => {
    const id = setTimeout(() => fetchPlaces(), 300);
    return () => clearTimeout(id);
  }, [fetchPlaces]);

  if (loading && places.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-text-muted">
        <span className="material-symbols-outlined text-5xl mb-4">map</span>
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  if (error && places.length === 0) {
    return (
      <div className="px-4 py-8">
        <ErrorState message={error} onRetry={fetchPlaces} retryLabel={t('common.retry')} />
      </div>
    );
  }

  const directionsUrl = selectedPlace
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(selectedPlace.lat + ',' + selectedPlace.lng)}`
    : '#';

  return (
    <div className="relative h-[calc(100vh-8rem)] md:h-[calc(100vh-6rem)] min-h-[400px] w-full -mx-0 md:mx-0 px-0 flex flex-col">
      {/* Search bar */}
      <div className="absolute top-4 left-2 right-2 z-[1000] flex justify-center px-2">
        <div className="w-full max-w-md bg-white/90 backdrop-blur-md shadow-soft rounded-full pl-5 pr-1.5 py-1.5 flex items-center gap-3 border border-white/50 ring-1 ring-black/5">
          <span className="material-symbols-outlined text-slate-400 text-xl">search</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('home.findPlace')}
            className="flex-1 bg-transparent border-none outline-none text-[15px] text-text-main placeholder-slate-400 focus:ring-0 py-2 font-medium"
            aria-label={t('home.findPlace')}
          />
          <button
            type="button"
            className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors text-slate-600"
            aria-label="Filters"
          >
            <span className="material-symbols-outlined text-[20px]">tune</span>
          </button>
        </div>
      </div>
      {/* Layers & My location */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-[1000] flex flex-col gap-3">
        <button
          type="button"
          className="w-10 h-10 bg-white/90 backdrop-blur shadow-soft rounded-full flex items-center justify-center text-slate-600 border border-white/50 hover:text-primary"
          aria-label="Layers"
        >
          <span className="material-symbols-outlined text-[20px]">layers</span>
        </button>
        <a
          href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-10 h-10 bg-white/90 backdrop-blur shadow-soft rounded-full flex items-center justify-center text-slate-600 border border-white/50 hover:text-primary"
          aria-label="My location"
        >
          <span className="material-symbols-outlined text-[20px]">near_me</span>
        </a>
      </div>
      {/* Map */}
      <div className="flex-1 min-h-0 w-full">
        <PlacesMap
          places={places}
          center={coords}
          onPlaceSelect={setSelectedPlace}
        />
      </div>
      {/* Bottom sheet - selected place */}
      {selectedPlace && (
        <div className="absolute bottom-0 left-0 right-0 z-[1000] px-2 pb-20 md:pb-6 pointer-events-auto animate-[slide-up_0.3s_ease-out]">
          <div className="bg-white border border-gray-100 shadow-card rounded-[2rem] p-5 w-full max-w-md mx-auto overflow-hidden">
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-8 h-1 bg-gray-200 rounded-full opacity-50" />
            <div className="flex gap-4 mt-2">
              <div className="relative w-28 h-28 flex-shrink-0 rounded-2xl overflow-hidden bg-gray-100">
                {selectedPlace.image_urls?.[0] ? (
                  <img src={selectedPlace.image_urls[0]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-4xl text-slate-400">place</span>
                  </div>
                )}
              </div>
              <div className="flex-1 flex flex-col justify-between py-0.5 min-w-0">
                <div>
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="text-xl font-bold text-slate-800 leading-tight truncate">{selectedPlace.name}</h3>
                    <a
                      href={`/places/${selectedPlace.place_code}`}
                      className="p-1 -mr-2 -mt-1 rounded-full hover:bg-slate-50 text-slate-400 hover:text-primary shrink-0"
                      aria-label={t('places.detail')}
                    >
                      <span className="material-symbols-outlined text-[22px]">bookmark_border</span>
                    </a>
                  </div>
                  <p className="text-[13px] text-slate-500 mt-1 font-medium truncate">{selectedPlace.address || selectedPlace.place_type || ''}</p>
                </div>
                <div className="flex items-center gap-3 mt-3 flex-wrap">
                  {selectedPlace.average_rating != null && (
                    <>
                      <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-lg text-amber-700 border border-amber-100 text-xs font-bold">
                        <span className="material-symbols-outlined text-[14px] text-amber-500">star</span>
                        {selectedPlace.average_rating.toFixed(1)}
                      </div>
                      <span className="text-xs text-slate-300">•</span>
                    </>
                  )}
                  {selectedPlace.distance != null && (
                    <span className="text-xs text-slate-500 font-medium">{formatDistance(selectedPlace.distance)}</span>
                  )}
                  {selectedPlace.is_open_now && (
                    <>
                      <span className="text-xs text-slate-300">•</span>
                      <span className="text-xs text-green-600 font-semibold bg-green-50 border border-green-100 px-2 py-1 rounded-lg">{t('places.openNow')}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3 mt-6">
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="col-span-3 bg-primary hover:bg-primary-dark text-white py-3.5 px-4 rounded-xl text-[15px] font-semibold flex items-center justify-center gap-2 transition-all shadow-lg"
              >
                <span className="material-symbols-outlined text-[20px]">directions</span>
                {t('placeDetail.directions')}
              </a>
              <button
                type="button"
                onClick={() => shareUrl(selectedPlace.name, `/places/${selectedPlace.place_code}`)}
                className="col-span-1 bg-slate-50 hover:bg-slate-100 text-slate-700 py-3.5 px-4 rounded-xl flex items-center justify-center border border-slate-200"
                aria-label="Share"
              >
                <span className="material-symbols-outlined text-[20px]">share</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
