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
      <div className="relative h-48 overflow-hidden">
        {place.images?.[0]?.url ? (
          <img
            src={getFullImageUrl(place.images[0].url)}
            alt={place.name}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-slate-300">image</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

        {/* Floating Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          {place.is_open_now && (
            <span className="bg-emerald-500 text-white text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm">
              {t('places.openNow')}
            </span>
          )}
        </div>

        {place.distance != null && (
          <div className="absolute bottom-3 left-3 bg-white/20 backdrop-blur-md border border-white/30 rounded-full px-2.5 py-1">
            <span className="text-white text-[10px] font-bold">{formatDistance(place.distance)}</span>
          </div>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <div className="flex justify-between items-start gap-2 mb-1">
          <h3 className="font-bold text-slate-800 dark:text-white text-[15px] leading-tight truncate">
            {place.name}
          </h3>
          {place.average_rating != null && (
            <div className="flex items-center gap-0.5 shrink-0">
              <span className="material-symbols-outlined text-amber-400 text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
              <span className="text-[13px] font-bold text-slate-700 dark:text-slate-300">{place.average_rating.toFixed(1)}</span>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mb-3 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">location_on</span>
          {place.address || place.place_type}
        </p>

        <div className="mt-auto flex items-center justify-between pt-3 border-t border-slate-50 dark:border-dark-border">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
            {place.place_type}
          </span>
          <span className="text-primary group-hover:translate-x-1 transition-transform">
            <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
