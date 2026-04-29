'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { Place } from '@/lib/types';
import type { SearchLocation } from '@/lib/utils/searchHistory';
import type { MapBounds } from '@/components/places/PlacesMap';
import PlaceCardUnified from '@/components/places/PlaceCardUnified';

const PlacesMap = dynamic(() => import('@/components/places/PlacesMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-soft-blue dark:bg-dark-surface" />,
});

interface PlaceMapViewProps {
  places: Place[];
  center: { lat: number; lng: number };
  selectedPlace: Place | null;
  onPlaceSelect: (place: Place | null) => void;
  t: (key: string) => string;
  isVisible?: boolean;
  searchLocation?: SearchLocation | null;
  initMapCenter?: { lat: number; lng: number };
  initMapZoom?: number;
  onMapMove?: (lat: number, lng: number, zoom: number) => void;
  skipAutoFit?: boolean;
  mapLoading?: boolean;
  showSearchArea?: boolean;
  onSearchArea?: () => void;
  onRecenter?: () => void;
  onBoundsChange?: (bounds: MapBounds) => void;
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
  initMapCenter,
  initMapZoom,
  onMapMove,
  skipAutoFit,
  mapLoading,
  showSearchArea,
  onSearchArea,
  onRecenter,
  onBoundsChange: onBoundsChangeProp,
}: PlaceMapViewProps) {
  const [visibleBounds, setVisibleBounds] = useState<MapBounds | null>(null);

  const handleBoundsChange = useCallback(
    (bounds: MapBounds) => {
      setVisibleBounds(bounds);
      onBoundsChangeProp?.(bounds);
    },
    [onBoundsChangeProp],
  );

  // Mobile bottom-sheet drag state
  const [sheetPx, setSheetPx] = useState<number | null>(null); // null = CSS percentage

  // Animate sheet height when a pin is selected/deselected
  useEffect(() => {
    setSheetPx(
      selectedPlace ? window.innerHeight * EXPANDED_RATIO : window.innerHeight * PEEK_RATIO,
    );
  }, [selectedPlace]);
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
        onBoundsChange={handleBoundsChange}
        className="h-full w-full bg-soft-blue dark:bg-dark-surface"
        initMapCenter={initMapCenter}
        initZoom={initMapZoom}
        onMapMove={onMapMove}
        skipAutoFit={skipAutoFit}
        onRecenter={onRecenter}
      />

      {/* "Search this area" floating button — appears after panning the map */}
      {showSearchArea && (
        <button
          onClick={onSearchArea}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-[600] flex items-center gap-1.5 px-4 py-2 rounded-full bg-white dark:bg-dark-surface shadow-lg border border-input-border/60 dark:border-dark-border text-sm font-semibold text-primary hover:bg-slate-50 dark:hover:bg-dark-border transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">search</span>
          {t('map.searchThisArea')}
        </button>
      )}

      {/* Loading spinner — top-right, subtle */}
      {mapLoading && (
        <div className="absolute top-3 right-3 z-[600] flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 dark:bg-dark-surface/90 shadow border border-input-border/40 dark:border-dark-border">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-500 dark:text-dark-text-secondary">
            {t('map.loading')}
          </span>
        </div>
      )}

      {(visiblePlaces.length > 0 || selectedPlace !== null) && (
        <>
          {/* ── Desktop: left side panel (overlay) ─────────────────────────── */}
          <div className="hidden md:flex lg:hidden flex-col absolute left-3 top-3 bottom-3 w-80 z-[500] bg-white/95 dark:bg-dark-surface backdrop-blur-xl rounded-2xl shadow-xl border border-input-border/60 dark:border-dark-border overflow-hidden">
            <div className="px-4 py-3 border-b border-input-border dark:border-dark-border shrink-0">
              {selectedPlace !== null ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                    {selectedPlace.name}
                  </p>
                  <button
                    onClick={() => onPlaceSelect(null)}
                    className="shrink-0 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-dark-border transition-colors"
                    aria-label="Close"
                  >
                    <span className="material-symbols-outlined text-[18px] text-slate-500 dark:text-slate-400">
                      close
                    </span>
                  </button>
                </div>
              ) : (
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {countLabel}
                </p>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {selectedPlace !== null ? (
                <PlaceCardUnified place={selectedPlace} t={t} />
              ) : (
                visiblePlaces.map((place) => (
                  <PlaceCardUnified key={place.place_code} place={place} t={t} />
                ))
              )}
            </div>
          </div>

          {/* ── Mobile: draggable bottom sheet (overlay) ────────────────────── */}
          <div
            className="md:hidden absolute bottom-[var(--mobile-bottom-nav-height)] left-0 right-0 z-[1000] flex flex-col bg-white/95 dark:bg-dark-surface backdrop-blur-xl rounded-t-3xl shadow-[0_-8px_40px_rgba(0,0,0,0.18)] border-t border-input-border/50 dark:border-dark-border"
            style={{
              height: sheetPx ? `${sheetPx}px` : `${PEEK_RATIO * 100}%`,
              transition: isDragging ? 'none' : 'height 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {selectedPlace !== null ? (
              <>
                {/* Selected-place header with close button */}
                <div className="shrink-0 pt-3 pb-2.5 px-4 border-b border-input-border/50 dark:border-dark-border">
                  <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-dark-border mx-auto mb-2.5" />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                      {selectedPlace.name}
                    </p>
                    <button
                      onClick={() => onPlaceSelect(null)}
                      className="shrink-0 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-dark-border transition-colors"
                      aria-label="Close"
                    >
                      <span className="material-symbols-outlined text-[18px] text-slate-500 dark:text-slate-400">
                        close
                      </span>
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3">
                  <PlaceCardUnified place={selectedPlace} t={t} />
                </div>
              </>
            ) : (
              <>
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
                {/* Scrollable card list — horizontal carousel on mobile, vertical list when expanded */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
                  <div className="flex flex-nowrap gap-3 overflow-x-auto pb-2 scrollbar-hide">
                    {visiblePlaces.map((place) => (
                      <div
                        key={place.place_code}
                        className="w-[75vw] max-w-xs flex-shrink-0 hover:scale-[1.02] transition-transform duration-200"
                      >
                        <PlaceCardUnified place={place} t={t} />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
