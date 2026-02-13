import { Link } from 'react-router-dom';
import type { Place } from '@/lib/types';
import { useI18n } from '@/app/providers';

interface PlaceCardProps {
  place: Place;
}

export default function PlaceCard({ place }: PlaceCardProps) {
  const { t } = useI18n();
  const imageUrl = place.image_urls?.[0] ?? '';

  return (
    <Link
      to={`/places/${place.place_code}`}
      className="block bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm border border-input-border hover:shadow-md transition-transform hover:-translate-y-0.5 group"
    >
      <div className="relative h-48 w-full overflow-hidden bg-gray-100 dark:bg-gray-700">
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
        {place.user_has_checked_in && (
          <div className="absolute top-4 right-4 z-10">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/90 text-white shadow-sm">
              <span className="material-symbols-outlined text-[14px] mr-1">check_circle</span>
              Visited
            </span>
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-text-main group-hover:text-primary transition-colors truncate">
              {place.name}
            </h3>
            <p className="text-sm text-text-muted flex items-center mt-1 truncate">
              <span className="material-symbols-outlined text-primary text-sm mr-1 shrink-0">location_on</span>
              <span className="truncate">{place.address || place.place_type}</span>
            </p>
          </div>
          {place.distance != null && (
            <div className="bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 px-2 py-1 rounded-lg shrink-0 ml-2">
              <span className="text-xs font-bold text-text-main">
                {place.distance < 1 ? `${Math.round(place.distance * 1000)} m` : `${place.distance.toFixed(1)} km`}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-600">
          <span className="text-xs font-medium text-primary uppercase tracking-wide">{t('places.detail')}</span>
        </div>
      </div>
    </Link>
  );
}
