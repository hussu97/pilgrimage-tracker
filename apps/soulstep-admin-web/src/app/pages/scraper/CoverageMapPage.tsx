import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Rectangle, CircleMarker, Tooltip } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { RefreshCw } from "lucide-react";
import {
  getMapCells,
  getMapPlaces,
  getRunActivity,
  listDataLocations,
  listRuns,
} from "@/lib/api/scraper";
import type {
  DataLocation,
  MapCellItem,
  MapPlaceItem,
  RunActivity,
  ScraperRun,
} from "@/lib/api/types";

// ── Pipeline stage helpers ────────────────────────────────────────────────────

type Stage = "pending" | "enriching" | "filtered" | "failed" | "passed";

const ALL_STAGES: Stage[] = ["passed", "enriching", "pending", "filtered", "failed"];

const STAGE_COLOR: Record<Stage, string> = {
  passed: "#22c55e",
  enriching: "#3b82f6",
  pending: "#f59e0b",
  filtered: "#9ca3af",
  failed: "#ef4444",
};

const STAGE_LABEL: Record<Stage, string> = {
  passed: "Enriched",
  enriching: "Enriching",
  pending: "Discovered",
  filtered: "Filtered",
  failed: "Failed",
};

function placeStage(p: MapPlaceItem): Stage {
  if (p.enrichment_status === "complete" && p.quality_gate === "passed") return "passed";
  if (p.enrichment_status === "filtered") return "filtered";
  if (p.quality_gate && p.quality_gate !== "passed") return "filtered";
  if (p.enrichment_status === "failed") return "failed";
  if (p.enrichment_status === "enriching") return "enriching";
  return "pending";
}

function cellColor(resultCount: number): string {
  const hue = Math.max(0, 120 - resultCount * 6);
  return `hsl(${hue}, 85%, 45%)`;
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({
  label,
  value,
  dimmed = false,
}: {
  label: string;
  value: string | number;
  dimmed?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-opacity ${
        dimmed
          ? "opacity-40 border-input-border dark:border-dark-border text-text-secondary dark:text-dark-text-secondary"
          : "border-input-border dark:border-dark-border bg-background-light dark:bg-dark-bg text-text-main dark:text-white"
      }`}
    >
      <span className="text-text-secondary dark:text-dark-text-secondary font-normal">
        {label}
      </span>
      <span className="tabular-nums font-semibold">{value.toLocaleString()}</span>
    </div>
  );
}

function StageToggle({
  stage,
  count,
  active,
  onClick,
}: {
  stage: Stage;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
        active
          ? "border-transparent"
          : "opacity-40 border-input-border dark:border-dark-border bg-transparent"
      }`}
      style={
        active
          ? {
              borderColor: STAGE_COLOR[stage] + "80",
              backgroundColor: STAGE_COLOR[stage] + "18",
              color: STAGE_COLOR[stage],
            }
          : {}
      }
      title={active ? `Hide ${STAGE_LABEL[stage]}` : `Show ${STAGE_LABEL[stage]}`}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: active ? STAGE_COLOR[stage] : "#9ca3af" }}
      />
      {STAGE_LABEL[stage]}
      <span className="tabular-nums">{count.toLocaleString()}</span>
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function CoverageMapPage() {
  const [runs, setRuns] = useState<ScraperRun[]>([]);
  const [locations, setLocations] = useState<DataLocation[]>([]);
  const [selectedRun, setSelectedRun] = useState("");
  const [cells, setCells] = useState<MapCellItem[]>([]);
  const [places, setPlaces] = useState<MapPlaceItem[]>([]);
  const [activity, setActivity] = useState<RunActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCells, setShowCells] = useState(true);
  const [showPlaces, setShowPlaces] = useState(true);
  const [activeStages, setActiveStages] = useState<Set<Stage>>(new Set(ALL_STAGES));

  // Load runs + locations once for the selector
  useEffect(() => {
    Promise.all([listRuns({ page_size: 100 }), listDataLocations()])
      .then(([r, l]) => {
        setRuns(r.items);
        setLocations(l);
      })
      .catch(() => {});
  }, []);

  // Load map data on run change
  useEffect(() => {
    setLoading(true);
    const params = selectedRun ? { run_code: selectedRun } : undefined;
    Promise.all([getMapCells(params), getMapPlaces(params)])
      .then(([c, p]) => {
        setCells(c);
        setPlaces(p);
      })
      .catch(() => {
        setCells([]);
        setPlaces([]);
      })
      .finally(() => setLoading(false));
  }, [selectedRun]);

  // Load per-run activity for image + sync counts
  useEffect(() => {
    if (!selectedRun) {
      setActivity(null);
      return;
    }
    getRunActivity(selectedRun)
      .then(setActivity)
      .catch(() => setActivity(null));
  }, [selectedRun]);

  const locationMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const loc of locations) m[loc.code] = loc.name;
    return m;
  }, [locations]);

  const stageCounts = useMemo(() => {
    const counts = { passed: 0, enriching: 0, pending: 0, filtered: 0, failed: 0 } as Record<
      Stage,
      number
    >;
    for (const p of places) counts[placeStage(p)]++;
    return counts;
  }, [places]);

  const visiblePlaces = useMemo(() => {
    if (!showPlaces) return [];
    return places.filter((p) => activeStages.has(placeStage(p)));
  }, [places, showPlaces, activeStages]);

  const bounds = useMemo<LatLngBoundsExpression>(() => {
    const lats: number[] = [];
    const lngs: number[] = [];
    for (const c of cells) {
      lats.push(c.lat_min, c.lat_max);
      lngs.push(c.lng_min, c.lng_max);
    }
    for (const p of places) {
      lats.push(p.lat);
      lngs.push(p.lng);
    }
    if (lats.length === 0) return [[-60, -160], [75, 160]];
    const latPad = Math.max((Math.max(...lats) - Math.min(...lats)) * 0.05, 0.05);
    const lngPad = Math.max((Math.max(...lngs) - Math.min(...lngs)) * 0.05, 0.05);
    return [
      [Math.min(...lats) - latPad, Math.min(...lngs) - lngPad],
      [Math.max(...lats) + latPad, Math.max(...lngs) + lngPad],
    ];
  }, [cells, places]);

  function toggleStage(stage: Stage) {
    setActiveStages((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  }

  const selectedRunObj = runs.find((r) => r.run_code === selectedRun);

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-5.5rem)]">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-text-main dark:text-white">Coverage Map</h1>
        <select
          value={selectedRun}
          onChange={(e) => setSelectedRun(e.target.value)}
          className="ml-auto text-sm rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface text-text-main dark:text-white px-3 py-1.5 cursor-pointer"
        >
          <option value="">All runs</option>
          {runs.map((r) => (
            <option key={r.run_code} value={r.run_code}>
              {locationMap[r.location_code] ?? r.location_code} ·{" "}
              {new Date(r.created_at).toLocaleDateString()} · {r.status}
            </option>
          ))}
        </select>
      </div>

      {/* ── Stats bar ── */}
      <div className="flex flex-wrap gap-2">
        {/* Cells */}
        <button
          onClick={() => setShowCells((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
            showCells
              ? "border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
              : "opacity-40 border-input-border dark:border-dark-border text-text-secondary dark:text-dark-text-secondary"
          }`}
          title={showCells ? "Hide search cells" : "Show search cells"}
        >
          <span className="w-3 h-1.5 rounded-sm bg-current inline-block" />
          Cells searched
          <span className="tabular-nums font-semibold ml-0.5">{cells.length.toLocaleString()}</span>
        </button>

        {/* Stage toggles */}
        {ALL_STAGES.map((stage) => (
          <StageToggle
            key={stage}
            stage={stage}
            count={stageCounts[stage]}
            active={showPlaces && activeStages.has(stage)}
            onClick={() => {
              if (!showPlaces) {
                setShowPlaces(true);
                setActiveStages(new Set([stage]));
              } else {
                toggleStage(stage);
              }
            }}
          />
        ))}

        {/* Image + sync stats (only when a run is selected) */}
        {activity && (
          <>
            <div className="w-px bg-input-border dark:bg-dark-border self-stretch mx-1" />
            <StatChip
              label="Images"
              value={`${activity.images_downloaded.toLocaleString()} / ${(activity.images_downloaded + activity.images_failed).toLocaleString()}`}
              dimmed={activity.images_downloaded === 0}
            />
            <StatChip
              label="Synced"
              value={activity.places_synced.toLocaleString()}
              dimmed={activity.places_synced === 0}
            />
          </>
        )}

        {/* Run status badge */}
        {selectedRunObj && (
          <span className="ml-auto text-xs px-2 py-1 rounded-md bg-background-light dark:bg-dark-bg border border-input-border dark:border-dark-border text-text-secondary dark:text-dark-text-secondary capitalize">
            {selectedRunObj.stage
              ? selectedRunObj.stage.replace(/_/g, " ")
              : selectedRunObj.status}
          </span>
        )}
      </div>

      {/* ── Map ── */}
      <div className="flex-1 rounded-xl overflow-hidden border border-input-border dark:border-dark-border relative">
        {loading ? (
          <div className="flex items-center justify-center h-full text-text-secondary dark:text-dark-text-secondary text-sm gap-2">
            <RefreshCw size={14} className="animate-spin" />
            Loading map…
          </div>
        ) : cells.length === 0 && places.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-secondary dark:text-dark-text-secondary text-sm">
            No map data yet. Run a scraper job to see coverage.
          </div>
        ) : (
          <MapContainer
            bounds={bounds}
            boundsOptions={{ padding: [30, 30] }}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />

            {/* Search coverage cells */}
            {showCells &&
              cells.map((c, i) => (
                <Rectangle
                  key={i}
                  bounds={[
                    [c.lat_min, c.lng_min],
                    [c.lat_max, c.lng_max],
                  ]}
                  pathOptions={{
                    color: cellColor(c.result_count),
                    fillColor: cellColor(c.result_count),
                    fillOpacity: 0.2,
                    weight: 1,
                  }}
                >
                  <Tooltip sticky>
                    <div style={{ fontSize: "12px", lineHeight: "1.6" }}>
                      <strong>Search cell</strong> · depth {c.depth}
                      <br />
                      {c.result_count} place{c.result_count !== 1 ? "s" : ""} found
                    </div>
                  </Tooltip>
                </Rectangle>
              ))}

            {/* Places */}
            {visiblePlaces.map((p) => {
              const stage = placeStage(p);
              const color = STAGE_COLOR[stage];
              return (
                <CircleMarker
                  key={p.place_code}
                  center={[p.lat, p.lng]}
                  radius={5}
                  pathOptions={{
                    color,
                    fillColor: color,
                    fillOpacity: 0.85,
                    weight: 1,
                  }}
                >
                  <Tooltip>
                    <div style={{ fontSize: "12px", lineHeight: "1.6" }}>
                      <strong>{p.name}</strong>
                      <br />
                      {STAGE_LABEL[stage]}
                      {p.quality_score != null && (
                        <> · score {p.quality_score.toFixed(2)}</>
                      )}
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            })}
          </MapContainer>
        )}

        {/* Legend overlay */}
        {!loading && (cells.length > 0 || places.length > 0) && (
          <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 dark:bg-dark-surface/90 backdrop-blur-sm rounded-lg border border-input-border dark:border-dark-border px-3 py-2 space-y-1.5">
            {/* Cell density */}
            <div className="flex items-center gap-2 text-[11px] text-text-secondary dark:text-dark-text-secondary">
              <div
                className="w-14 h-2.5 rounded-sm"
                style={{
                  background:
                    "linear-gradient(to right, hsl(120,85%,45%), hsl(60,85%,45%), hsl(0,85%,45%))",
                }}
              />
              <span>low → high density</span>
            </div>
            {/* Place stage colors */}
            {ALL_STAGES.map((stage) => (
              <div
                key={stage}
                className="flex items-center gap-2 text-[11px] text-text-secondary dark:text-dark-text-secondary"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: STAGE_COLOR[stage] }}
                />
                <span>{STAGE_LABEL[stage]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
