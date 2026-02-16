import { Link } from 'react-router-dom';
import type { Place } from '@/lib/types';
import { getFullImageUrl } from '@/lib/utils/imageUtils';

interface PlaceCardUnifiedProps {
  place: Place;
  t: (key: string) => string;
}

function formatDistance(km: number): string {
  if (km === undefined) return '';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export default function PlaceCardUnified({ place, t }: PlaceCardUnifiedProps) {
  return (
    <Link
      to={`/places/${place.place_code}`}
      className="group relative flex flex-col bg-white dark:bg-dark-surface rounded-3xl overflow-hidden shadow-soft hover:shadow-xl transition-all duration-500 hover:-translate-y-1 border border-slate-100 dark:border-dark-border"
    >
      <div className="relative h-56 overflow-hidden">
        {place.images?.[0]?.url ? (
          <img
            src={getFullImageUrl(place.images[0].url)}
            alt={place.name}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <span className="material-symbols-outlined text-5xl text-slate-300">image</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

        {/* Floating Badges */}
        <div className="absolute top-4 left-4 flex flex-col gap-2">
          {place.is_open_now && (
            <span className="bg-primary/90 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-lg border border-white/20">
              {t('places.openNow')}
            </span>
          )}
        </div>

        {place.distance != null && (
          <div className="absolute bottom-4 left-4 bg-black/30 backdrop-blur-md border border-white/10 rounded-full px-3 py-1">
            <span className="text-white text-[11px] font-bold">{formatDistance(place.distance)}</span>
          </div>
        )}

        {place.average_rating != null && (
          <div className="absolute top-4 right-4 flex items-center gap-1 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-2xl shadow-lg border border-white/20">
            <span className="material-symbols-outlined text-amber-500 text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
            <span className="text-xs font-bold text-slate-900">{place.average_rating.toFixed(1)}</span>
          </div>
        )}
      </div>

      <div className="p-5 flex-1 flex flex-col">
        <div className="mb-4">
          <h3 className="font-bold text-slate-900 dark:text-white text-lg leading-tight truncate mb-1">
            {place.name}
          </h3>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1 font-medium">
            <span className="material-symbols-outlined text-base">location_on</span>
            {place.address || place.place_type}
          </p>
        </div>

        <div className="mt-auto flex items-center justify-between pt-4 border-t border-slate-50 dark:border-dark-border">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary/40"></span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] leading-none">
              {place.place_type}
            </span>
          </div>
          <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-dark-bg flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300">
            <span className="material-symbols-outlined text-xl">arrow_forward</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
