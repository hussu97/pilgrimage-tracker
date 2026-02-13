import { useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Place } from '@/lib/types';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER: [number, number] = [25, 0];
const DEFAULT_ZOOM = 3;
const USER_ZOOM = 11;

const religionColors: Record<string, string> = {
  islam: '#16a34a',
  hinduism: '#ea580c',
  christianity: '#2563eb',
};

function createMarkerIcon(religion: string): L.DivIcon {
  const color = religionColors[religion] ?? '#6b7280';
  return L.divIcon({
    className: 'place-marker',
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
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
}

export default function PlacesMap({ places, center }: PlacesMapProps) {
  const mapCenter: [number, number] = center ? [center.lat, center.lng] : DEFAULT_CENTER;
  const zoom = center ? USER_ZOOM : DEFAULT_ZOOM;

  return (
    <div className="rounded-2xl overflow-hidden border border-input-border h-[400px] md:h-[500px] bg-gray-100 dark:bg-gray-800">
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
        {places.map((place) => (
          <Marker
            key={place.place_code}
            position={[place.lat, place.lng]}
            icon={createMarkerIcon(place.religion)}
          >
            <Popup>
              <div className="min-w-[160px]">
                <p className="font-semibold text-gray-900 mb-1">{place.name}</p>
                {place.distance != null && (
                  <p className="text-sm text-gray-600 mb-2">
                    {place.distance < 1
                      ? `${Math.round(place.distance * 1000)} m away`
                      : `${place.distance.toFixed(1)} km away`}
                  </p>
                )}
                <Link
                  to={`/places/${place.place_code}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  View details
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
