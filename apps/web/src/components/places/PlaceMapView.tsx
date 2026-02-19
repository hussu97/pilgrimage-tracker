import { Link } from 'react-router-dom';
import type { Place } from '@/lib/types';
import PlacesMap from '@/components/places/PlacesMap';

interface PlaceMapViewProps {
  places: Place[];
  center: { lat: number; lng: number };
  selectedPlace: Place | null;
  onPlaceSelect: (place: Place | null) => void;
  t: (key: string) => string;
  isVisible?: boolean;
}

function formatDistance(km: number): string {
  if (km === undefined) return '';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export default function PlaceMapView({
  places,
  center,
  selectedPlace,
  onPlaceSelect,
  t,
  isVisible,
}: PlaceMapViewProps) {
  return (
    <div className="h-full w-full absolute inset-0">
      <PlacesMap
        places={places}
        center={center}
        onPlaceSelect={onPlaceSelect}
        selectedPlaceCode={selectedPlace?.place_code}
        isVisible={isVisible}
      />

      {/* Selection Card (Parity with Mobile App) */}
      {selectedPlace && (
        <div className="absolute bottom-10 left-4 right-4 z-[1000] animate-in slide-in-from-bottom-8 duration-300 max-w-lg mx-auto">
          <div className="bg-white/95 backdrop-blur-xl dark:bg-dark-surface/95 rounded-3xl shadow-2xl p-4 border border-white/50 dark:border-dark-border relative group cursor-pointer transition-transform active:scale-[0.98]">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPlaceSelect(null);
              }}
              className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-dark-bg rounded-full text-slate-400 hover:text-slate-600 transition-colors z-20"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>

            <div className="flex gap-4">
              <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 shadow-soft bg-slate-100 dark:bg-dark-bg">
                {selectedPlace.images?.[0]?.url ? (
                  <img
                    src={selectedPlace.images[0].url}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-300">
                    <span className="material-symbols-outlined text-4xl">place</span>
                  </div>
                )}
              </div>

              <div className="flex-1 flex flex-col py-0.5 min-w-0">
                <div className="mb-auto">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-slate-900 dark:text-white text-lg leading-tight truncate pr-4">
                      {selectedPlace.name}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 font-medium truncate mb-2">
                    {selectedPlace.address || selectedPlace.place_type}
                  </p>

                  <div className="flex items-center gap-3">
                    {selectedPlace.average_rating != null && (
                      <div className="flex items-center gap-1 text-slate-900 dark:text-slate-200 font-bold text-xs">
                        <span
                          className="material-symbols-outlined text-amber-500 text-[14px]"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          star
                        </span>
                        {selectedPlace.average_rating.toFixed(1)}
                        <span className="text-slate-400 font-normal ml-0.5">
                          ({selectedPlace.review_count || 0})
                        </span>
                      </div>
                    )}
                    {selectedPlace.distance != null && (
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                        {formatDistance(selectedPlace.distance)} away
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3">
                  <Link
                    to={`/places/${selectedPlace.place_code}`}
                    className="bg-primary hover:bg-blue-600 text-white text-[11px] font-bold uppercase tracking-widest px-6 py-2 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95"
                  >
                    {t('places.detail')}
                  </Link>
                  <button className="w-9 h-9 flex items-center justify-center bg-slate-50 dark:bg-dark-bg rounded-xl text-slate-400 hover:text-primary transition-colors border border-slate-100 dark:border-dark-border">
                    <span className="material-symbols-outlined text-[20px]">ios_share</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
