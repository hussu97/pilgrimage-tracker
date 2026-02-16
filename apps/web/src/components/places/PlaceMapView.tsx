import { Link } from 'react-router-dom';
import type { Place } from '@/lib/types';
import PlacesMap from '@/components/PlacesMap';

interface PlaceMapViewProps {
  places: Place[];
  center: { lat: number; lng: number };
  selectedPlace: Place | null;
  onPlaceSelect: (place: Place | null) => void;
  t: (key: string) => string;
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
}: PlaceMapViewProps) {
  return (
    <div className="h-full w-full absolute inset-0">
      <PlacesMap
        places={places}
        center={center}
        onPlaceSelect={onPlaceSelect}
      />

      {/* Selection Card (Parity with Mobile App) */}
      {selectedPlace && (
        <div className="absolute bottom-10 left-4 right-4 z-[1000] animate-in slide-in-from-bottom-8 duration-300 max-w-lg mx-auto">
          <div className="bg-white/95 backdrop-blur-xl dark:bg-dark-surface/95 rounded-[2.5rem] shadow-2xl p-5 border border-white/50 dark:border-dark-border relative group">
            <button
              onClick={() => onPlaceSelect(null)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-dark-bg rounded-full text-slate-400 hover:text-slate-600 transition-colors z-20"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>

            <div className="flex gap-5">
              <div className="w-28 h-28 rounded-3xl overflow-hidden shrink-0 shadow-lg">
                {selectedPlace.images?.[0]?.url ? (
                  <img src={selectedPlace.images[0].url} alt="" className="w-full h-full object-cover" />
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
  );
}
