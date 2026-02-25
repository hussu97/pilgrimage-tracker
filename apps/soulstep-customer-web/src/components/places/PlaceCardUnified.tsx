import React from 'react';
import { Link } from 'react-router-dom';
import type { Place } from '@/lib/types';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import { formatDistance } from '@/lib/utils/place-utils';

interface PlaceCardUnifiedProps {
  place: Place;
  t: (key: string) => string;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function PlaceCardUnified({ place, t }: PlaceCardUnifiedProps) {
  const openStatus =
    place.open_status ??
    (place.is_open_now === true ? 'open' : place.is_open_now === false ? 'closed' : 'unknown');
  const rating = place.average_rating;
  const reviewCount = place.review_count ?? 0;

  return (
    <Link
      to={`/places/${place.place_code}`}
      className="group relative block rounded-3xl overflow-hidden shadow-soft hover:shadow-xl transition-all duration-500 hover:-translate-y-1"
    >
      <div className="relative h-[280px] overflow-hidden">
        {place.images?.[0]?.url ? (
          <img
            src={getFullImageUrl(place.images[0].url)}
            alt={place.name}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full bg-slate-800 flex items-center justify-center">
            <span className="material-symbols-outlined text-5xl text-slate-500">image</span>
          </div>
        )}

        {/* Status pill – top left */}
        <div className="absolute top-4 left-4 z-10">
          {openStatus === 'open' && (
            <span className="badge-open-glass">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              {t('places.open')}
            </span>
          )}
          {openStatus === 'closed' && (
            <span className="badge-closed-glass">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              {t('places.closed')}
            </span>
          )}
          {openStatus === 'unknown' && (
            <span className="badge-unknown-glass">{t('places.unknown')}</span>
          )}
        </div>

        {/* Visited badge – top right */}
        {place.user_has_checked_in && (
          <div className="absolute top-4 right-4 z-10">
            <span className="badge-visited">
              <span className="material-symbols-outlined text-[12px]">check</span>
              {t('places.visited')}
            </span>
          </div>
        )}

        {/* Glass info panel – bottom */}
        <div
          className="absolute bottom-4 left-4 right-4 z-10 rounded-2xl p-3.5 border"
          style={{
            background: 'rgba(255,255,255,0.15)',
            borderColor: 'rgba(255,255,255,0.25)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          <h3 className="text-white font-semibold text-[15px] leading-tight truncate mb-1">
            {place.name}
          </h3>
          <div className="flex items-center gap-1 mb-2.5">
            <span className="material-symbols-outlined text-[12px] text-white/75">location_on</span>
            <p className="text-[11px] text-white/80 truncate font-medium">{place.address || ''}</p>
          </div>
          <div className="h-px bg-white/20 mb-2.5" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {place.distance != null && (
                <span className="text-[10px] font-bold text-white/75 uppercase tracking-[0.08em]">
                  {formatDistance(place.distance)}
                </span>
              )}
              {rating != null && (
                <div
                  className="flex items-center gap-1 px-2 py-1 rounded-full border shrink-0"
                  style={{
                    background: 'rgba(0,0,0,0.30)',
                    borderColor: 'rgba(255,255,255,0.10)',
                  }}
                >
                  <span
                    className="material-symbols-outlined text-amber-400 text-[10px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    star
                  </span>
                  <span className="text-[10px] font-bold text-white">
                    {rating.toFixed(1)}
                    {reviewCount > 0 ? ` (${formatCount(reviewCount)})` : ''}
                  </span>
                </div>
              )}
            </div>
            {!place.user_has_checked_in && (
              <div className="ml-2 px-3.5 py-1.5 rounded-full bg-white shrink-0">
                <span className="text-[10px] font-bold text-slate-900 uppercase tracking-[0.08em]">
                  {t('places.checkIn')}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default React.memo(PlaceCardUnified);
