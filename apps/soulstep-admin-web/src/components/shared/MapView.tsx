import { useMemo } from "react";
import { MapContainer, TileLayer, Rectangle, CircleMarker, Tooltip } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import type { MapCellItem, MapPlaceItem } from "@/lib/api/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_CELLS = 2000;
const MAX_PLACES = 2000;

// ── Helpers ────────────────────────────────────────────────────────────────────

/** HSL color: green (120°) for low result counts → red (0°) for high (≥20). */
function cellColor(resultCount: number): string {
  const hue = Math.max(0, 120 - resultCount * 6);
  return `hsl(${hue}, 85%, 45%)`;
}

/** Status color for a scraped place marker. */
function placeColor(place: MapPlaceItem): string {
  if (place.quality_gate === "passed") return "#22c55e";
  if (place.enrichment_status === "failed") return "#ef4444";
  if (place.enrichment_status === "filtered") return "#9ca3af";
  if (place.enrichment_status === "enriching") return "#3b82f6";
  return "#f59e0b";
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface MapViewProps {
  cells: MapCellItem[];
  places: MapPlaceItem[];
  height?: string;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MapView({ cells, places, height = "500px", className = "" }: MapViewProps) {
  const truncatedCells = cells.slice(0, MAX_CELLS);
  const truncatedPlaces = places.slice(0, MAX_PLACES);
  const cellsTruncated = cells.length > MAX_CELLS;
  const placesTruncated = places.length > MAX_PLACES;

  // Compute auto-bounds from data, fall back to world view
  const bounds = useMemo<LatLngBoundsExpression>(() => {
    const lats: number[] = [];
    const lngs: number[] = [];
    for (const c of truncatedCells) {
      lats.push(c.lat_min, c.lat_max);
      lngs.push(c.lng_min, c.lng_max);
    }
    for (const p of truncatedPlaces) {
      lats.push(p.lat);
      lngs.push(p.lng);
    }
    if (lats.length === 0) {
      return [[-60, -160], [75, 160]];
    }
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    // Add small padding
    const latPad = Math.max((maxLat - minLat) * 0.05, 0.01);
    const lngPad = Math.max((maxLng - minLng) * 0.05, 0.01);
    return [
      [minLat - latPad, minLng - lngPad],
      [maxLat + latPad, maxLng + lngPad],
    ];
  }, [truncatedCells, truncatedPlaces]);

  if (cells.length === 0 && places.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-input-border dark:border-dark-border bg-background-light dark:bg-dark-bg text-sm text-text-secondary dark:text-dark-text-secondary ${className}`}
        style={{ height }}
      >
        No map data yet
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} style={{ height }}>
      {(cellsTruncated || placesTruncated) && (
        <div className="absolute top-2 right-2 z-[1000] bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-xs px-2 py-1 rounded-md border border-amber-300 dark:border-amber-700">
          Showing first {MAX_CELLS} cells / {MAX_PLACES} places
        </div>
      )}
      <MapContainer
        bounds={bounds}
        style={{ height: "100%", width: "100%", borderRadius: "0.75rem" }}
        scrollWheelZoom
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {truncatedCells.map((c, i) => (
          <Rectangle
            key={i}
            bounds={[[c.lat_min, c.lng_min], [c.lat_max, c.lng_max]]}
            pathOptions={{
              color: cellColor(c.result_count),
              fillColor: cellColor(c.result_count),
              fillOpacity: 0.35,
              weight: 1,
            }}
          >
            <Tooltip>
              <span className="text-xs">
                Depth {c.depth} · {c.result_count} result{c.result_count !== 1 ? "s" : ""}
              </span>
            </Tooltip>
          </Rectangle>
        ))}

        {truncatedPlaces.map((p) => (
          <CircleMarker
            key={p.place_code}
            center={[p.lat, p.lng]}
            radius={6}
            pathOptions={{
              color: placeColor(p),
              fillColor: placeColor(p),
              fillOpacity: 0.8,
              weight: 1,
            }}
          >
            <Tooltip>
              <span className="text-xs">
                {p.name}
                {p.quality_score != null ? ` · score ${p.quality_score.toFixed(2)}` : ""}
              </span>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

// ── Legend ─────────────────────────────────────────────────────────────────────

export function MapLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-secondary dark:text-dark-text-secondary pt-2">
      {/* Cell density gradient */}
      <div className="flex items-center gap-1.5">
        <div className="w-16 h-3 rounded-sm" style={{
          background: "linear-gradient(to right, hsl(120,85%,45%), hsl(60,85%,45%), hsl(0,85%,45%))"
        }} />
        <span>low → high density</span>
      </div>
      {/* Place status dots */}
      {[
        { color: "#22c55e", label: "passed" },
        { color: "#3b82f6", label: "enriching" },
        { color: "#ef4444", label: "failed" },
        { color: "#9ca3af", label: "filtered" },
        { color: "#f59e0b", label: "pending" },
      ].map(({ color, label }) => (
        <div key={label} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
