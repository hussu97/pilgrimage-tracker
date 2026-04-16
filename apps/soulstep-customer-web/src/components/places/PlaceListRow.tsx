'use client';

import React from 'react';
import type { Place } from '@/lib/types';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import { cn } from '@/lib/utils/cn';

interface PlaceListRowProps {
  place: Place;
  t: (key: string) => string;
  leftBadge?: React.ReactNode;
  rightSlot?: React.ReactNode;
  isHighlighted?: boolean;
  onClick?: () => void;
}

function PlaceListRow({
  place,
  t,
  leftBadge,
  rightSlot,
  isHighlighted = false,
  onClick,
}: PlaceListRowProps) {
  const imageUrl = place.images?.[0]?.url ? getFullImageUrl(place.images[0].url) : null;

  const openStatus =
    place.open_status ??
    (place.is_open_now === true ? 'open' : place.is_open_now === false ? 'closed' : 'unknown');
  const rating = place.average_rating;
  const reviewCount = place.review_count ?? 0;

  const content = (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-3 rounded-2xl border transition-all',
        'bg-white/80 dark:bg-dark-surface/80 backdrop-blur-sm shadow-soft',
        isHighlighted
          ? 'border-primary dark:border-primary'
          : 'border-white/50 dark:border-dark-border',
      )}
    >
      {/* Left badge slot */}
      {leftBadge && <div className="shrink-0">{leftBadge}</div>}

      {/* Thumbnail */}
      <div className="w-[60px] h-[60px] rounded-xl overflow-hidden flex-shrink-0 bg-slate-100 dark:bg-dark-border flex items-center justify-center">
        {imageUrl ? (
          <img src={imageUrl} alt={place.name} className="w-full h-full object-cover" />
        ) : (
          <span className="material-icons text-slate-400 dark:text-dark-text-secondary">place</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">
          {place.name}
        </p>
        {place.address && (
          <p className="text-xs text-slate-400 dark:text-dark-text-secondary truncate mt-0.5">
            {place.address}
          </p>
        )}
        {/* Status + rating pills */}
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {openStatus === 'open' && (
            <span className="badge-open-glass text-[9px]">
              <span className="w-1 h-1 rounded-full bg-green-400" />
              {t('places.open')}
            </span>
          )}
          {openStatus === 'closed' && (
            <span className="badge-closed-glass text-[9px]">
              <span className="w-1 h-1 rounded-full bg-red-400" />
              {t('places.closed')}
            </span>
          )}
          {rating != null && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30">
              <span
                className="material-symbols-outlined text-amber-400 text-[9px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                star
              </span>
              <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400">
                {rating.toFixed(1)}
                {reviewCount > 0 ? ` (${reviewCount})` : ''}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Right slot */}
      {rightSlot && <div className="flex items-center gap-1 shrink-0">{rightSlot}</div>}
    </div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="w-full text-left">
        {content}
      </button>
    );
  }

  return content;
}

export default React.memo(PlaceListRow);
