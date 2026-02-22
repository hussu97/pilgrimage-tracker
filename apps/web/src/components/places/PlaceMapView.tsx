import { useState, useMemo } from 'react';
import type { Place } from '@/lib/types';
import type { SearchLocation } from '@/lib/utils/searchHistory';
import type { MapBounds } from '@/components/places/PlacesMap';
import PlacesMap from '@/components/places/PlacesMap';
import PlaceCardUnified from '@/components/places/PlaceCardUnified';

interface PlaceMapViewProps {
  places: Place[];
  center: { lat: number; lng: number };
  selectedPlace: Place | null;
  onPlaceSelect: (place: Place | null) => void;
  t: (key: string) => string;
  isVisible?: boolean;
  searchLocation?: SearchLocation | null;
}

export default function PlaceMapView({
  places,
  center,
  selectedPlace,
  onPlaceSelect,
  t,
  isVisible,
  searchLocation,
}: PlaceMapViewProps) {
  const [visibleBounds, setVisibleBounds] = useState<MapBounds | null>(null);

  const visiblePlaces = useMemo(() => {
    if (!visibleBounds) return places;
    return places.filter(
      (p) =>
        p.lat >= visibleBounds.south &&
        p.lat <= visibleBounds.north &&
        p.lng >= visibleBounds.west &&
        p.lng <= visibleBounds.east,
    );
  }, [places, visibleBounds]);

  const countLabel = t('map.placesInView').replace('{count}', String(visiblePlaces.length));

  return (
    <div className="h-full w-full absolute inset-0 flex flex-col md:flex-row">
      {/* ── Desktop: left side panel ──────────────────────────────────────── */}
      <div className="hidden md:flex flex-col w-80 shrink-0 bg-white/95 dark:bg-dark-surface backdrop-blur-xl border-r border-input-border dark:border-dark-border z-[500] overflow-hidden">
        <div className="px-4 py-3 border-b border-input-border dark:border-dark-border shrink-0">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{countLabel}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {visiblePlaces.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 mb-3">
                location_off
              </span>
              <p className="text-sm text-slate-400 dark:text-slate-500">
                {t('home.noPlacesFound')}
              </p>
            </div>
          ) : (
            visiblePlaces.map((place) => (
              <PlaceCardUnified key={place.place_code} place={place} t={t} />
            ))
          )}
        </div>
      </div>

      {/* ── Map area ──────────────────────────────────────────────────────── */}
      <div className="relative flex-1 h-full min-h-0 overflow-hidden">
        <PlacesMap
          places={places}
          center={center}
          onPlaceSelect={onPlaceSelect}
          selectedPlaceCode={selectedPlace?.place_code}
          isVisible={isVisible}
          searchLocation={searchLocation}
          onBoundsChange={setVisibleBounds}
          className="h-full w-full bg-soft-blue dark:bg-dark-surface"
        />

        {/* ── Mobile: bottom sheet ────────────────────────────────────────── */}
        <div
          className="md:hidden absolute bottom-0 left-0 right-0 z-[1000] flex flex-col bg-white/95 dark:bg-dark-surface backdrop-blur-xl rounded-t-3xl shadow-2xl border-t border-input-border/50 dark:border-dark-border"
          style={{ height: '52%' }}
        >
          {/* Handle + header */}
          <div className="shrink-0 pt-3 pb-2.5 px-4 border-b border-input-border/50 dark:border-dark-border">
            <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-dark-border mx-auto mb-2.5" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{countLabel}</p>
          </div>
          {/* Scrollable card list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {visiblePlaces.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <span className="material-symbols-outlined text-3xl text-slate-300 dark:text-slate-600 mb-2">
                  location_off
                </span>
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  {t('home.noPlacesFound')}
                </p>
              </div>
            ) : (
              visiblePlaces.map((place) => (
                <PlaceCardUnified key={place.place_code} place={place} t={t} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
