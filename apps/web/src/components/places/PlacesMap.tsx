/**
 * PlacesMap — vanilla Leaflet + leaflet.markercluster.
 *
 * We deliberately avoid react-leaflet here because its MapContainer has a
 * stale-closure bug that breaks React Strict Mode: the ref callback captures
 * `context === null` from the initial render (empty useCallback deps), so
 * React's reappearLayoutEffects step fires `commitAttachRef` → the guard
 * always passes → a second LeafletMap is constructed on the same div → crash.
 *
 * Using vanilla Leaflet with useLayoutEffect gives us full lifecycle control:
 *   • map is created exactly once per mount
 *   • cleanup removes it synchronously (disappearLayoutEffects phase)
 *   • reappearLayoutEffects finds a clean div and succeeds
 */
import { useLayoutEffect, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import type { Place } from '@/lib/types';

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
      <div style="position:relative;display:flex;align-items:center;justify-content:center;">
        <div style="
          width:${size}px;height:${size}px;border-radius:50%;
          background:white;border:3px solid ${color};
          box-shadow:0 8px 24px rgba(0,0,0,0.15);
          display:flex;align-items:center;justify-content:center;
        ">
          <div style="width:12px;height:12px;border-radius:50%;background:${color};"></div>
        </div>
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
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:rgba(22,163,74,0.9);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${count < 100 ? 13 : 11}px;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.2);">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

interface PlacesMapProps {
  places: Place[];
  center: { lat: number; lng: number } | null;
  onPlaceSelect?: (place: Place) => void;
  selectedPlaceCode?: string | null;
}

export default function PlacesMap({
  places,
  center,
  onPlaceSelect,
  selectedPlaceCode,
}: PlacesMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const navigate = useNavigate();

  // ── Initialize map once per mount ────────────────────────────────────────
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const mapCenter = center ? ([center.lat, center.lng] as [number, number]) : DEFAULT_CENTER;
    const zoom = center ? USER_ZOOM : DEFAULT_ZOOM;

    const map = L.map(containerRef.current, { center: mapCenter, zoom, zoomControl: true });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    // Cleanup: runs synchronously during disappearLayoutEffects (Strict Mode
    // offscreen phase) — before reappearLayoutEffects re-fires on the same div.
    return () => {
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update markers whenever places or selection changes ───────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove previous cluster layer
    if (clusterRef.current) {
      map.removeLayer(clusterRef.current);
      clusterRef.current = null;
    }

    if (places.length === 0) return;

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 60,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: createClusterIcon,
    });

    places.forEach((place) => {
      const isSelected = place.place_code === selectedPlaceCode;
      const marker = L.marker([place.lat, place.lng], {
        icon: createMarkerIcon(place.open_status, isSelected),
        zIndexOffset: isSelected ? 1000 : 0,
      });

      if (onPlaceSelect) {
        marker.on('click', () => onPlaceSelect(place));
      } else {
        const distHtml =
          place.distance != null
            ? `<p style="font-size:13px;color:#6b7280;margin:2px 0 8px">${formatDistance(place.distance)} away</p>`
            : '';
        marker.bindPopup(`
          <div style="min-width:160px">
            <p style="font-weight:600;color:#111;margin:0 0 2px">${place.name}</p>
            ${distHtml}
            <a data-place="${place.place_code}" href="/places/${place.place_code}"
               style="font-size:13px;font-weight:500;color:#2563eb;display:inline-flex;align-items:center;gap:4px">
              View details <span style="font-size:14px">→</span>
            </a>
          </div>
        `);
        // SPA-friendly navigation via react-router
        marker.on('popupopen', () => {
          const el = marker.getPopup()?.getElement();
          el?.querySelector<HTMLAnchorElement>('[data-place]')?.addEventListener('click', (e) => {
            e.preventDefault();
            navigate(`/places/${place.place_code}`);
          });
        });
      }

      cluster.addLayer(marker);
    });

    map.addLayer(cluster);
    clusterRef.current = cluster;

    // Fit map to all markers
    const lats = places.map((p) => p.lat);
    const lngs = places.map((p) => p.lng);
    const bounds = L.latLngBounds(
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    );
    map.fitBounds(bounds.pad(0.15), { maxZoom: 14 });
  }, [places, onPlaceSelect, selectedPlaceCode, navigate]);

  return (
    <div className="rounded-2xl overflow-hidden border border-input-border h-full min-h-[400px] md:min-h-[500px] bg-soft-blue dark:bg-gray-800">
      <div ref={containerRef} className="h-full w-full" style={{ minHeight: 400 }} />
    </div>
  );
}
