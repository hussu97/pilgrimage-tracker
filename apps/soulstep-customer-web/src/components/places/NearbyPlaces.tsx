import { useI18n } from '@/app/providers';
import type { NearbyPlace } from '@/lib/types/places';
import type { Place } from '@/lib/types';
import PlaceCardUnified from './PlaceCardUnified';

interface NearbyPlacesProps {
  title: string;
  places: NearbyPlace[];
}

export default function NearbyPlaces({ title, places }: NearbyPlacesProps) {
  const { t } = useI18n();

  if (!places || places.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold text-text-main dark:text-white mb-3">{title}</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {places.map((place) => {
          // Normalize NearbyPlace to the shape PlaceCardUnified expects
          const placeObj = {
            place_code: place.place_code,
            name: place.name,
            address: '',
            images: place.image_url ? [{ url: place.image_url }] : [],
            average_rating: place.average_rating ?? null,
          } as unknown as Place;

          return (
            <div key={place.place_code} className="shrink-0 w-40">
              <PlaceCardUnified place={placeObj} t={t} variant="tile" />
            </div>
          );
        })}
      </div>
    </section>
  );
}
