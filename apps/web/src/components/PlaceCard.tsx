import { Link } from 'react-router-dom';
import type { Place } from '@/lib/types';
import { useI18n } from '@/app/providers';

interface PlaceCardProps {
  place: Place;
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export default function PlaceCard({ place }: PlaceCardProps) {
  const { t } = useI18n();
  const imageUrl = place.image_urls?.[0] ?? '';
  const rating = place.average_rating;
  const reviewCount = place.review_count ?? 0;
  const showOpenNow = place.is_open_now === true;

  return (
    <Link
      to={`/places/${place.place_code}`}
      className="block bg-surface dark:bg-gray-800 rounded-2xl overflow-hidden shadow-card border border-input-border hover:shadow-soft transition-transform hover:-translate-y-0.5 group"
    >
      <div className="relative h-48 w-full overflow-hidden bg-soft-blue dark:bg-gray-700">
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-70" />
        <div className="absolute top-3 right-3 left-3 flex justify-between items-start z-10">
          {showOpenNow && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/90 text-white border border-emerald-400/30 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
              {t('places.openNow')}
            </span>
          )}
          {place.user_has_checked_in && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold bg-white/20 backdrop-blur-md text-white border border-white/30 shadow-sm">
              <span className="material-symbols-outlined text-[12px] mr-1">check</span>
              {t('places.visited')}
            </span>
          )}
        </div>
      </div>
      <div className="p-4">
        <div className="flex justify-between items-start gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-text-main group-hover:text-primary transition-colors truncate leading-tight">
              {place.name}
            </h3>
            <p className="text-sm text-text-secondary flex items-center mt-1 truncate">
              <span className="material-symbols-outlined text-icon-grey text-sm mr-1 shrink-0">location_on</span>
              <span className="truncate">{place.address || place.place_type}</span>
            </p>
          </div>
          {place.distance != null && (
            <span className="text-xs font-medium text-text-secondary bg-blue-tint border border-blue-100/50 px-2 py-1 rounded-xl shrink-0">
              {formatDistance(place.distance)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-600">
          {rating != null && (
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-amber-400 text-base">star</span>
              <span className="text-sm font-semibold text-text-main">{rating.toFixed(1)}</span>
              {reviewCount > 0 && (
                <span className="text-xs text-text-muted">({reviewCount})</span>
              )}
            </div>
          )}
          <span className="text-xs font-medium text-primary uppercase tracking-wide">{t('places.detail')}</span>
        </div>
      </div>
    </Link>
  );
}
