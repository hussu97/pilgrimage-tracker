import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Rectangle, Tooltip } from "react-leaflet";
import type { DiscoveryCellItem } from "@/lib/api/types";

interface Props {
  cells: DiscoveryCellItem[];
}

function fmtDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m}m`;
}

export function CellsMap({ cells }: Props) {
  if (cells.length === 0) return null;

  const allLats = cells.flatMap((c) => [c.lat_min, c.lat_max]);
  const allLngs = cells.flatMap((c) => [c.lng_min, c.lng_max]);
  const bounds: [[number, number], [number, number]] = [
    [Math.min(...allLats), Math.min(...allLngs)],
    [Math.max(...allLats), Math.max(...allLngs)],
  ];

  return (
    <div className="rounded-xl overflow-hidden border border-input-border dark:border-dark-border h-80">
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [20, 20] }}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {cells.map((c, i) => (
          <Rectangle
            key={i}
            bounds={[
              [c.lat_min, c.lng_min],
              [c.lat_max, c.lng_max],
            ]}
            pathOptions={{
              color: c.saturated ? "#f59e0b" : "#22c55e",
              fillColor: c.saturated ? "#fef3c7" : "#dcfce7",
              fillOpacity: 0.35,
              weight: 1,
            }}
          >
            <Tooltip sticky>
              <div style={{ fontSize: "12px", lineHeight: "1.5" }}>
                <p>
                  <strong>Depth {c.depth}</strong> · {c.result_count} found
                </p>
                <p>
                  {fmtDistance(c.width_m)} × {fmtDistance(c.height_m)}
                </p>
                <p>{c.saturated ? "saturated" : "ok"}</p>
              </div>
            </Tooltip>
          </Rectangle>
        ))}
      </MapContainer>
    </div>
  );
}
