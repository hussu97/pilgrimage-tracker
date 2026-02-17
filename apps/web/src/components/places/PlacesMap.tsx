import { useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import type { Place } from '@/lib/types';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER: [number, number] = [25, 0];
const DEFAULT_ZOOM = 3;
const USER_ZOOM = 11;

const openStatusColors: Record<string, string> = {
  open: 'rgba(22, 163, 74, 0.85)',
  closed: 'rgba(220, 38, 38, 0.85)',
  unknown: 'rgba(148, 163, 184, 0.85)',
};

function createMarkerIcon(openStatus: string | undefined, isSelected = false): L.DivIcon {
  const color = openStatusColors[openStatus ?? 'unknown'] ?? openStatusColors.unknown;
  const size = isSelected ? 40 : 32;
  return L.divIcon({
    className: 'place-marker',
    html: `
      <div class="relative flex items-center justify-center">
        <div style="
          width:${size}px;
          height:${size}px;
          border-radius:50%;
          background:white;
          border:3px solid ${color};
          box-shadow:0 8px 24px rgba(0,0,0,0.15);
          display:flex;
          align-items:center;
          justify-center;
        " class="relative z-10">
          <div style="width:12px;height:12px;border-radius:50%;background:${color};margin:auto;"></div>
        </div>
        ${isSelected ? '<div class="absolute inset-0 rounded-full bg-primary/20 animate-ping"></div>' : ''}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count < 10 ? 36 : count < 100 ? 44 : 52;
  return L.divIcon({
    className: 'place-cluster',
    html: `
      <div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:rgba(22,163,74,0.9);color:#fff;
        display:flex;align-items:center;justify-content:center;
        font-weight:700;font-size:${count < 100 ? 13 : 11}px;
        border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.2);
      ">${count}</div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FitBounds({ places }: { places: Place[] }) {
  const map = useMap();
  const bounds = useMemo(() => {
    if (places.length === 0) return null;
    const lats = places.map((p) => p.lat);
    const lngs = places.map((p) => p.lng);
    return L.latLngBounds(
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)]
    );
  }, [places]);
  useEffect(() => {
    if (bounds && places.length > 0) {
      map.fitBounds(bounds.pad(0.15), { maxZoom: 14 });
    }
  }, [map, bounds, places.length]);
  return null;
}

interface PlacesMapProps {
  places: Place[];
  center: { lat: number; lng: number } | null;
  onPlaceSelect?: (place: Place) => void;
  selectedPlaceCode?: string | null;
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export default function PlacesMap({ places, center, onPlaceSelect, selectedPlaceCode }: PlacesMapProps) {
  const mapCenter: [number, number] = center ? [center.lat, center.lng] : DEFAULT_CENTER;
  const zoom = center ? USER_ZOOM : DEFAULT_ZOOM;

  return (
    <div className="rounded-2xl overflow-hidden border border-input-border h-full min-h-[400px] md:min-h-[500px] bg-soft-blue dark:bg-gray-800">
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        className="h-full w-full"
        scrollWheelZoom
        style={{ minHeight: 400 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {places.length > 0 && <FitBounds places={places} />}
        <MarkerClusterGroup
          iconCreateFunction={createClusterIcon}
          maxClusterRadius={60}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          zoomToBoundsOnClick
          chunkedLoading
        >
          {places.map((place) => {
            const isSelected = place.place_code === selectedPlaceCode;
            return (
              <Marker
                key={place.place_code}
                position={[place.lat, place.lng]}
                icon={createMarkerIcon(place.open_status, isSelected)}
                eventHandlers={onPlaceSelect ? { click: () => onPlaceSelect(place) } : undefined}
                zIndexOffset={isSelected ? 1000 : 0}
              >
                {!onPlaceSelect && <Popup>
                  <div className="min-w-[160px]">
                    <p className="font-semibold text-gray-900 mb-1">{place.name}</p>
                    {place.distance != null && (
                      <p className="text-sm text-gray-600 mb-2">{formatDistance(place.distance)} away</p>
                    )}
                    <Link
                      to={`/places/${place.place_code}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      View details
                      <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </Link>
                  </div>
                </Popup>}
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}
