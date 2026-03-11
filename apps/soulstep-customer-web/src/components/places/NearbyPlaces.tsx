import { Link } from 'react-router-dom';
import type { NearbyPlace } from '@/lib/types/places';
import { getFullImageUrl } from '@/lib/utils/imageUtils';

interface NearbyPlacesProps {
  title: string;
  places: NearbyPlace[];
}

export default function NearbyPlaces({ title, places }: NearbyPlacesProps) {
  if (!places || places.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold text-text-main dark:text-white mb-3">{title}</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {places.map((place) => {
          const to = place.seo_slug
            ? `/places/${place.place_code}/${place.seo_slug}`
            : `/places/${place.place_code}`;
          const imgUrl = place.image_url ? getFullImageUrl(place.image_url) : null;

          return (
            <Link
              key={place.place_code}
              to={to}
              className="shrink-0 w-40 rounded-xl overflow-hidden bg-white dark:bg-dark-surface border border-slate-100 dark:border-dark-border shadow-sm hover:shadow-md transition-shadow group"
            >
              <div className="w-full h-24 bg-slate-100 dark:bg-dark-bg overflow-hidden">
                {imgUrl ? (
                  <img
                    src={imgUrl}
                    alt={place.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-2xl text-slate-300">
                      explore
                    </span>
                  </div>
                )}
              </div>
              <div className="p-2">
                <p className="text-xs font-semibold text-text-main dark:text-white leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                  {place.name}
                </p>
                {place.average_rating != null && (
                  <div className="flex items-center gap-1 mt-1">
                    <span
                      className="material-symbols-outlined text-amber-400 text-[10px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      star
                    </span>
                    <span className="text-[10px] font-semibold text-text-main dark:text-white">
                      {place.average_rating.toFixed(1)}
                    </span>
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
