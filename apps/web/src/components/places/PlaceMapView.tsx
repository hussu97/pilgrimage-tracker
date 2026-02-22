import { useState, useMemo, useRef } from 'react';
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

const PEEK_RATIO = 0.32; // fraction of viewport height when resting
const EXPANDED_RATIO = 0.65; // fraction when dragged up

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

  // Mobile bottom-sheet drag state
  const [sheetPx, setSheetPx] = useState<number | null>(null); // null = CSS percentage
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const visiblePlaces = useMemo(() => {
    if (!visibleBounds) return [];
    return places.filter(
      (p) =>
        p.lat >= visibleBounds.south &&
        p.lat <= visibleBounds.north &&
        p.lng >= visibleBounds.west &&
        p.lng <= visibleBounds.east,
    );
  }, [places, visibleBounds]);

  const countLabel = t('map.placesInView').replace('{count}', String(visiblePlaces.length));

  // ── Mobile sheet drag handlers ────────────────────────────────────────────
  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const currentH = sheetPx ?? window.innerHeight * PEEK_RATIO;
    dragRef.current = { startY: e.clientY, startH: currentH };
    setIsDragging(true);
  };

  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dy = e.clientY - dragRef.current.startY;
    const newH = Math.max(
      80,
      Math.min(window.innerHeight * EXPANDED_RATIO, dragRef.current.startH - dy),
    );
    setSheetPx(newH);
  };

  const onHandlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dy = e.clientY - dragRef.current.startY;
    const newH = dragRef.current.startH - dy;
    const peekH = window.innerHeight * PEEK_RATIO;
    const expandH = window.innerHeight * EXPANDED_RATIO;
    const mid = (peekH + expandH) / 2;
    setSheetPx(newH > mid ? expandH : peekH);
    dragRef.current = null;
    setIsDragging(false);
  };

  return (
    // Map fills the entire container; panels are absolute overlays on top
    <div className="h-full w-full absolute inset-0">
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

      {visiblePlaces.length > 0 && (
        <>
          {/* ── Desktop: left side panel (overlay) ─────────────────────────── */}
          <div className="hidden md:flex flex-col absolute left-3 top-3 bottom-3 w-80 z-[500] bg-white/95 dark:bg-dark-surface backdrop-blur-xl rounded-2xl shadow-xl border border-input-border/60 dark:border-dark-border overflow-hidden">
            <div className="px-4 py-3 border-b border-input-border dark:border-dark-border shrink-0">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {countLabel}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {visiblePlaces.map((place) => (
                <PlaceCardUnified key={place.place_code} place={place} t={t} />
              ))}
            </div>
          </div>

          {/* ── Mobile: draggable bottom sheet (overlay) ────────────────────── */}
          <div
            className="md:hidden absolute bottom-0 left-0 right-0 z-[1000] flex flex-col bg-white/95 dark:bg-dark-surface backdrop-blur-xl rounded-t-3xl shadow-2xl border-t border-input-border/50 dark:border-dark-border"
            style={{
              height: sheetPx ? `${sheetPx}px` : `${PEEK_RATIO * 100}%`,
              transition: isDragging ? 'none' : 'height 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {/* Drag handle + count — pointer events live here */}
            <div
              className="shrink-0 pt-3 pb-2.5 px-4 border-b border-input-border/50 dark:border-dark-border cursor-grab active:cursor-grabbing select-none"
              style={{ touchAction: 'none' }}
              onPointerDown={onHandlePointerDown}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
              onPointerCancel={onHandlePointerUp}
            >
              <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-dark-border mx-auto mb-2.5" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {countLabel}
              </p>
            </div>
            {/* Scrollable card list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {visiblePlaces.map((place) => (
                <PlaceCardUnified key={place.place_code} place={place} t={t} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
