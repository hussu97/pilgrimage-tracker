/**
 * JourneyMapView — lightweight Leaflet map showing only the journey's places.
 *
 * Uses vanilla Leaflet (same pattern as PlacesMap.tsx) to avoid react-leaflet
 * strict-mode bugs. Auto-fits bounds to all markers on mount.
 */
import { useLayoutEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface JourneyPlace {
  place_code: string;
  name: string;
  latitude: number;
  longitude: number;
  user_checked_in?: boolean;
}

interface JourneyMapViewProps {
  places: JourneyPlace[];
  onPlaceSelect?: (placeCode: string) => void;
  className?: string;
}

function createJourneyMarkerIcon(checkedIn: boolean): L.DivIcon {
  const color = checkedIn ? 'rgba(34,197,94,0.9)' : 'rgba(59,130,246,0.9)';
  return L.divIcon({
    className: 'journey-marker',
    html: `
      <div style="
        width:32px;height:32px;border-radius:50%;
        background:white;border:3px solid ${color};
        box-shadow:0 4px 12px rgba(0,0,0,0.18);
        display:flex;align-items:center;justify-content:center;
      ">
        <div style="width:11px;height:11px;border-radius:50%;background:${color};"></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

export default function JourneyMapView({
  places,
  onPlaceSelect,
  className = '',
}: JourneyMapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Create map
    const map = L.map(el, {
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: true,
    });

    mapRef.current = map;

    // Tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    // Markers
    const validPlaces = places.filter(
      (p) => typeof p.latitude === 'number' && typeof p.longitude === 'number',
    );

    const markers: L.Marker[] = [];

    validPlaces.forEach((place) => {
      const icon = createJourneyMarkerIcon(!!place.user_checked_in);
      const marker = L.marker([place.latitude, place.longitude], { icon });

      const popupContent = `
        <div style="font-family:system-ui;font-size:13px;font-weight:600;color:#1e293b;padding:4px 2px;">
          ${place.name}
        </div>
      `;
      marker.bindPopup(popupContent, { closeButton: false, maxWidth: 180 });

      marker.on('click', () => {
        onPlaceSelect?.(place.place_code);
      });

      marker.addTo(map);
      markers.push(marker);
    });

    // Fit bounds
    if (markers.length > 0) {
      const group = L.featureGroup(markers);
      const bounds = group.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 });
      }
    } else {
      // Default world view
      map.setView([20, 0], 2);
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount

  // Update markers when places change (checked-in status)
  useLayoutEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove all existing markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        map.removeLayer(layer);
      }
    });

    const validPlaces = places.filter(
      (p) => typeof p.latitude === 'number' && typeof p.longitude === 'number',
    );

    const markers: L.Marker[] = [];

    validPlaces.forEach((place) => {
      const icon = createJourneyMarkerIcon(!!place.user_checked_in);
      const marker = L.marker([place.latitude, place.longitude], { icon });

      const popupContent = `
        <div style="font-family:system-ui;font-size:13px;font-weight:600;color:#1e293b;padding:4px 2px;">
          ${place.name}
        </div>
      `;
      marker.bindPopup(popupContent, { closeButton: false, maxWidth: 180 });

      marker.on('click', () => {
        onPlaceSelect?.(place.place_code);
      });

      marker.addTo(map);
      markers.push(marker);
    });
  }, [places, onPlaceSelect]);

  return (
    <div
      ref={containerRef}
      className={`w-full rounded-2xl overflow-hidden ${className}`}
      style={{ minHeight: 220 }}
    />
  );
}
