import { Link } from 'react-router-dom';
import type { Place } from '@/lib/types';
import { useI18n } from '@/app/providers';
import { getFullImageUrl } from '@/lib/utils/imageUtils';

interface PlaceCardProps {
  place: Place;
  compact?: boolean;
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export default function PlaceCard({ place, compact = false }: PlaceCardProps) {
  const { t } = useI18n();
  const imageUrl = getFullImageUrl(place.images?.[0]?.url);
  const rating = place.average_rating;
  const reviewCount = place.review_count ?? 0;
  const openStatus =
    place.open_status ??
    (place.is_open_now === true ? 'open' : place.is_open_now === false ? 'closed' : 'unknown');
  const isOpen = openStatus === 'open';
  const isClosed = openStatus === 'closed';
  const isUnknown = openStatus === 'unknown';

  if (compact) {
    return (
      <Link
        to={`/places/${place.place_code}`}
        className="flex gap-4 h-32 bg-white dark:bg-dark-surface rounded-2xl p-4 shadow-card border border-slate-100 dark:border-dark-border items-center hover:shadow-card-md transition-shadow group"
      >
        <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 bg-soft-blue dark:bg-dark-surface">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl text-text-muted">explore</span>
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col justify-center h-full py-1 min-w-0">
          <h3 className="text-base font-medium text-slate-800 dark:text-white leading-tight truncate group-hover:text-primary transition-colors">
            {place.name}
          </h3>
          <p className="text-xs text-slate-400 dark:text-dark-text-secondary mt-1 line-clamp-2 font-light">
            {place.address || place.place_type || ''}
          </p>
          <div className="flex items-center gap-2 mt-3">
            {isOpen && (
              <span className="badge-open">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                {t('places.open')}
              </span>
            )}
            {isClosed && <span className="badge-closed">{t('places.closed')}</span>}
            {isUnknown && <span className="badge-unknown">{t('places.unknown')}</span>}
            {place.distance != null && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-dark-surface text-slate-500 dark:text-dark-text-secondary">
                {formatDistance(place.distance)}
              </span>
            )}
            {rating != null && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-800/30">
                <span
                  className="material-symbols-outlined text-[10px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  star
                </span>
                {rating.toFixed(1)}
                {reviewCount > 0 && <span className="text-amber-500/70">({reviewCount})</span>}
              </span>
            )}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to={`/places/${place.place_code}`}
      className="block bg-surface dark:bg-dark-surface rounded-2xl overflow-hidden shadow-card border border-slate-100 dark:border-dark-border hover:shadow-card-md transition-all hover:-translate-y-0.5 group"
    >
      {/* Hero image with gradient overlay */}
      <div className="relative h-48 w-full overflow-hidden bg-soft-blue dark:bg-dark-surface">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-text-muted">explore</span>
          </div>
        )}
        {/* Hero gradient: top-to-bottom with darkening at both ends for text readability */}
        <div className="absolute inset-0 hero-gradient" />

        {/* Top badges */}
        <div className="absolute top-3 right-3 left-3 flex justify-between items-start z-10">
          <div className="flex items-center gap-2">
            {isOpen && (
              <span className="badge-open">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                {t('places.open')}
              </span>
            )}
            {isClosed && <span className="badge-closed">{t('places.closed')}</span>}
            {isUnknown && <span className="badge-unknown">{t('places.unknown')}</span>}
          </div>
          {place.user_has_checked_in && (
            <span className="badge-visited">
              <span className="material-symbols-outlined text-[12px]">check</span>
              {t('places.visited')}
            </span>
          )}
        </div>
      </div>

      {/* Card body – 16px padding */}
      <div className="p-4">
        <div className="flex justify-between items-start gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-text-main dark:text-white group-hover:text-primary transition-colors truncate leading-tight">
              {place.name}
            </h3>
            <p className="text-sm text-text-secondary dark:text-dark-text-secondary flex items-center mt-1 truncate">
              <span className="material-symbols-outlined text-icon-grey text-sm mr-1 shrink-0">
                location_on
              </span>
              <span className="truncate">{place.address || place.place_type}</span>
            </p>
          </div>
          {place.distance != null && (
            <span className="text-xs font-medium text-text-secondary dark:text-dark-text-secondary bg-blue-tint dark:bg-dark-surface border border-blue-100/50 dark:border-dark-border px-2 py-1 rounded-xl shrink-0 whitespace-nowrap">
              {formatDistance(place.distance)}
            </span>
          )}
        </div>

        {/* Footer – rating pill + CTA */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-dark-border">
          {rating != null ? (
            <div className="flex items-center gap-1.5">
              <span
                className="material-symbols-outlined text-amber-400 text-base"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                star
              </span>
              <span className="text-sm font-semibold text-text-main dark:text-white">
                {rating.toFixed(1)}
              </span>
              {reviewCount > 0 && <span className="text-xs text-text-muted">({reviewCount})</span>}
            </div>
          ) : (
            <span />
          )}
          <span className="text-xs font-semibold text-primary uppercase tracking-wide">
            {t('places.detail')}
          </span>
        </div>
      </div>
    </Link>
  );
}
