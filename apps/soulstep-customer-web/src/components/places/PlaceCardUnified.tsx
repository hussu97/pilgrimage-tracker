import React from 'react';
import { Link } from 'react-router-dom';
import type { Place } from '@/lib/types';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import { formatDistance } from '@/lib/utils/place-utils';

interface PlaceCardUnifiedProps {
  place: Place;
  t: (key: string) => string;
  variant?: 'default' | 'recommended' | 'tile';
  onAddToJourney?: (e: React.MouseEvent) => void;
  className?: string;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function PlaceCardUnified({
  place,
  t,
  variant = 'default',
  onAddToJourney,
  className,
}: PlaceCardUnifiedProps) {
  const openStatus =
    place.open_status ??
    (place.is_open_now === true ? 'open' : place.is_open_now === false ? 'closed' : 'unknown');
  const rating = place.average_rating;
  const reviewCount = place.review_count ?? 0;
  const imageHeight = variant === 'tile' ? 'h-[180px]' : 'h-[320px]';
  const nameSizeClass = variant === 'tile' ? 'text-[13px]' : 'text-base';

  return (
    <Link
      to={`/places/${place.place_code}`}
      className={`group relative block rounded-3xl overflow-hidden shadow-soft hover:shadow-xl transition-all duration-500 hover:-translate-y-1 ${className ?? ''}`}
    >
      <div className={`relative ${imageHeight} overflow-hidden`}>
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

        {/* Top-right: distance pill stacked above visited badge */}
        <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-1.5">
          {place.distance != null && (
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold text-white uppercase tracking-[0.08em] border"
              style={{
                background: 'rgba(0,0,0,0.40)',
                borderColor: 'rgba(255,255,255,0.20)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
            >
              {formatDistance(place.distance)}
            </span>
          )}
          {place.user_has_checked_in && (
            <span className="badge-visited">
              <span className="material-symbols-outlined text-[12px]">check</span>
              {t('places.visited')}
            </span>
          )}
        </div>

        {/* Glass info panel – bottom */}
        <div
          className="absolute bottom-3 left-3 right-3 z-10 rounded-2xl p-3 border"
          style={{
            background: 'rgba(255,255,255,0.15)',
            borderColor: 'rgba(255,255,255,0.25)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          <h3 className={`text-white font-semibold leading-tight truncate mb-1 ${nameSizeClass}`}>
            {place.name}
          </h3>
          <div className="flex items-center gap-1 mb-2.5">
            <span className="material-symbols-outlined text-[12px] text-white/75">location_on</span>
            <p className="text-xs text-white/80 truncate font-medium">{place.address || ''}</p>
          </div>
          {variant !== 'tile' && (
            <>
              <div className="h-px bg-white/20 mb-2.5" />
              <div className="flex items-center justify-between flex-wrap gap-y-1.5">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {rating != null && (
                    <div
                      className="flex items-center gap-1 px-2 py-1 rounded-full border shrink-0"
                      style={{
                        background: 'rgba(0,0,0,0.30)',
                        borderColor: 'rgba(255,255,255,0.10)',
                      }}
                    >
                      <span
                        className="material-symbols-outlined text-amber-400 text-[11px]"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        star
                      </span>
                      <span className="text-[11px] font-bold text-white">
                        {rating.toFixed(1)}
                        {reviewCount > 0 ? ` (${formatCount(reviewCount)})` : ''}
                      </span>
                    </div>
                  )}
                </div>
                {variant !== 'recommended' && !place.user_has_checked_in && (
                  <div className="ml-2 px-3.5 py-1.5 rounded-full bg-white shrink-0">
                    <span className="text-[11px] font-bold text-slate-900 uppercase tracking-[0.08em]">
                      {t('places.checkIn')}
                    </span>
                  </div>
                )}
              </div>

              {/* Add to Journey button — recommended variant only */}
              {variant === 'recommended' && onAddToJourney && (
                <button
                  type="button"
                  onClick={onAddToJourney}
                  className="mt-2.5 w-full px-3.5 py-1.5 rounded-full bg-white/90 hover:bg-white transition-colors text-center"
                >
                  <span className="text-[11px] font-bold text-slate-900 uppercase tracking-[0.08em]">
                    + {t('map.addToJourney')}
                  </span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

export default React.memo(PlaceCardUnified);
