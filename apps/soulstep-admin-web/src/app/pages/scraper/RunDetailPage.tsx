import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as Tabs from "@radix-ui/react-tabs";
import {
  cancelRun,
  deleteRun,
  getRun,
  getRunActivity,
  getRunCells,
  getRunData,
  getRunRawData,
  reEnrichRun,
  resumeRun,
  syncRun,
} from "@/lib/api/scraper";
import type {
  DiscoveryCellItem,
  RawCollectorEntry,
  RunActivity,
  ScrapedPlaceData,
  ScraperRun,
} from "@/lib/api/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Pagination } from "@/components/shared/Pagination";
import { SearchInput } from "@/components/shared/SearchInput";
import { usePolling } from "@/lib/hooks/usePolling";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatDate } from "@/lib/utils";
import { statusVariant } from "@/lib/utils/scraperStatus";
import { ArrowLeft, Play, RefreshCw, Trash2, UploadCloud, XCircle } from "lucide-react";

function enrichVariant(s: string) {
  if (s === "complete") return "success" as const;
  if (s === "failed") return "danger" as const;
  if (s === "enriching") return "info" as const;
  return "neutral" as const;
}

// ── Live Activity Panel ─────────────────────────────────────────────────────

function LiveActivityPanel({ run, activity }: { run: ScraperRun; activity: RunActivity }) {
  const stage = run.stage;
  const showCells = activity.cells_total > 0;
  const showEnrichment =
    activity.places_complete > 0 ||
    activity.places_enriching.length > 0 ||
    activity.places_failed > 0 ||
    stage === "enrichment";

  const cellsSatPct =
    activity.cells_total > 0
      ? Math.round((activity.cells_saturated / activity.cells_total) * 100)
      : 0;
  const enrichPct =
    activity.places_total > 0
      ? Math.round((activity.places_complete / activity.places_total) * 100)
      : 0;

  return (
    <div className="rounded-xl border border-primary/40 dark:border-primary/30 bg-primary/5 dark:bg-primary/[0.08] p-4 space-y-4">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-primary animate-pulse inline-block" />
        <span className="text-xs font-semibold text-primary uppercase tracking-wide">
          Live Activity
        </span>
        {stage && (
          <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded bg-primary/10 text-primary capitalize">
            {stage.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {/* Discovery */}
      {showCells && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-text-secondary dark:text-dark-text-secondary uppercase tracking-wide">
            Discovery
          </p>
          <div className="flex items-center gap-3 flex-wrap text-xs text-text-main dark:text-white">
            <span>
              <span className="font-semibold">{activity.cells_total.toLocaleString()}</span>{" "}
              cells searched
            </span>
            <span className="text-text-secondary">·</span>
            <span>
              <span className="font-semibold">{activity.cells_saturated.toLocaleString()}</span>{" "}
              saturated ({cellsSatPct}%)
            </span>
            <span className="text-text-secondary">·</span>
            <span>
              <span className="font-semibold">{activity.places_total.toLocaleString()}</span>{" "}
              places found
            </span>
          </div>
          {activity.cells_total > 0 && (
            <div className="w-full bg-background-light dark:bg-dark-bg rounded-full h-1.5">
              <div
                className="bg-primary/60 h-1.5 rounded-full transition-all duration-700"
                style={{ width: `${cellsSatPct}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Enrichment */}
      {showEnrichment && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-text-secondary dark:text-dark-text-secondary uppercase tracking-wide">
            Enrichment
          </p>
          <div className="flex items-center gap-3 flex-wrap text-xs">
            <span className="text-green-600 dark:text-green-400 font-semibold">
              {activity.places_complete.toLocaleString()} enriched
            </span>
            {activity.places_failed > 0 && (
              <>
                <span className="text-text-secondary">·</span>
                <span className="text-red-500 font-semibold">
                  {activity.places_failed} failed
                </span>
              </>
            )}
            {activity.places_pending > 0 && (
              <>
                <span className="text-text-secondary">·</span>
                <span className="text-text-secondary dark:text-dark-text-secondary">
                  {activity.places_pending} pending
                </span>
              </>
            )}
          </div>
          {activity.places_total > 0 && (
            <div className="w-full bg-background-light dark:bg-dark-bg rounded-full h-1.5">
              <div
                className="bg-green-500 h-1.5 rounded-full transition-all duration-700"
                style={{ width: `${enrichPct}%` }}
              />
            </div>
          )}

          {activity.places_enriching.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-xs text-text-secondary dark:text-dark-text-secondary">
                Currently enriching:
              </p>
              {activity.places_enriching.map((p) => (
                <div
                  key={p.place_code}
                  className="flex items-center gap-1.5 text-xs text-text-main dark:text-white"
                >
                  <RefreshCw size={11} className="animate-spin text-primary flex-shrink-0" />
                  <span className="truncate">{p.name}</span>
                  <span className="text-text-secondary dark:text-dark-text-secondary font-mono ml-auto flex-shrink-0">
                    {p.place_code}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!showCells && !showEnrichment && (
        <p className="text-xs text-text-secondary dark:text-dark-text-secondary">
          Waiting for scraper to start…
        </p>
      )}
    </div>
  );
}

// ── Cells Tab ───────────────────────────────────────────────────────────────

function CellsTab({ runCode }: { runCode: string }) {
  const [cells, setCells] = useState<DiscoveryCellItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const { page, pageSize, setPage, setPageSize } = usePagination(50);

  useEffect(() => {
    setLoading(true);
    getRunCells(runCode, { page, page_size: pageSize })
      .then((r) => {
        setCells(r.items);
        setTotal(r.total);
      })
      .catch(() => {
        setCells([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [runCode, page, pageSize]);

  const cols: Column<DiscoveryCellItem>[] = [
    {
      key: "depth",
      header: "Depth",
      render: (c) => (
        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-background-light dark:bg-dark-bg text-text-secondary dark:text-dark-text-secondary">
          {c.depth}
        </span>
      ),
    },
    {
      key: "center",
      header: "Center (lat, lng)",
      render: (c) => (
        <span className="font-mono text-xs text-text-secondary dark:text-dark-text-secondary">
          {(((c.lat_min + c.lat_max) / 2)).toFixed(4)},{" "}
          {(((c.lng_min + c.lng_max) / 2)).toFixed(4)}
        </span>
      ),
    },
    {
      key: "radius_m",
      header: "Radius",
      render: (c) => (
        <span className="text-xs text-text-secondary dark:text-dark-text-secondary">
          {c.radius_m >= 1000
            ? `${(c.radius_m / 1000).toFixed(1)} km`
            : `${c.radius_m} m`}
        </span>
      ),
    },
    {
      key: "result_count",
      header: "Found",
      render: (c) => (
        <span className="text-xs font-semibold text-text-main dark:text-white">
          {c.result_count}
        </span>
      ),
    },
    {
      key: "saturated",
      header: "Saturated",
      render: (c) =>
        c.saturated ? (
          <StatusBadge label="saturated" variant="warning" />
        ) : (
          <StatusBadge label="ok" variant="success" />
        ),
    },
    {
      key: "created_at",
      header: "Searched At",
      render: (c) => (
        <span className="text-xs text-text-secondary dark:text-dark-text-secondary">
          {c.created_at ? formatDate(c.created_at) : "—"}
        </span>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-text-secondary dark:text-dark-text-secondary text-sm">
        Loading cells…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary dark:text-dark-text-secondary">
        {total.toLocaleString()} cells searched during discovery
      </p>
      <DataTable
        columns={cols}
        data={cells}
        rowKey={(c) => `${c.lat_min}-${c.lat_max}-${c.lng_min}-${c.lng_max}-${c.depth}`}
        emptyMessage="No discovery cells found for this run."
      />
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export function RunDetailPage() {
  const { runCode } = useParams<{ runCode: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<ScraperRun | null>(null);
  const [places, setPlaces] = useState<ScrapedPlaceData[]>([]);
  const [total, setTotal] = useState(0);
  const [rawData, setRawData] = useState<RawCollectorEntry[]>([]);
  const [activity, setActivity] = useState<RunActivity | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expandedRaw, setExpandedRaw] = useState<Set<string>>(new Set());
  const { page, pageSize, setPage, setPageSize } = usePagination(50);

  // Track active tab so we only poll places when the places tab is visible
  const [activeTab, setActiveTab] = useState("places");
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const loadRun = useCallback(async () => {
    if (!runCode) return;
    try {
      setRun(await getRun(runCode));
    } catch {/* ignore */}
  }, [runCode]);

  const loadActivity = useCallback(async () => {
    if (!runCode) return;
    try {
      setActivity(await getRunActivity(runCode));
    } catch {/* ignore */}
  }, [runCode]);

  const loadData = useCallback(async () => {
    if (!runCode) return;
    try {
      const result = await getRunData(runCode, {
        search: search || undefined,
        page,
        page_size: pageSize,
      });
      setPlaces(result.items);
      setTotal(result.total);
    } catch {
      setPlaces([]);
      setTotal(0);
    }
  }, [runCode, search, page, pageSize]);

  // Load raw collector data once per run
  useEffect(() => {
    if (!runCode) return;
    getRunRawData(runCode).then(setRawData).catch(() => setRawData([]));
  }, [runCode]);

  useEffect(() => {
    if (!runCode) return;
    setLoading(true);
    void Promise.all([loadRun(), loadData(), loadActivity()]).finally(() => setLoading(false));
  }, [loadRun, loadData, loadActivity, runCode]);

  const isActive = run?.status === "pending" || run?.status === "running";
  const isResumable =
    run?.status === "interrupted" || run?.status === "failed" || run?.status === "cancelled";

  // Poll run metadata + activity every 3 s while active
  usePolling(loadRun, 3000, isActive);
  usePolling(loadActivity, 3000, isActive);

  // Poll places every 5 s while active and places tab is open
  const pollPlaces = useCallback(async () => {
    if (activeTabRef.current === "places") await loadData();
  }, [loadData]);
  usePolling(pollPlaces, 5000, isActive);

  const handleAction = async (action: string) => {
    if (!runCode) return;
    try {
      if (action === "cancel") await cancelRun(runCode);
      else if (action === "sync") await syncRun(runCode);
      else if (action === "re-enrich") await reEnrichRun(runCode);
      else if (action === "resume") await resumeRun(runCode);
      await loadRun();
    } catch {/* ignore */}
  };

  const handleDelete = async () => {
    if (!runCode) return;
    await deleteRun(runCode);
    navigate("/scraper/runs");
  };

  const progressPct = run?.total_items
    ? Math.min(100, Math.round((run.processed_items / run.total_items) * 100))
    : 0;

  const groupedRaw = rawData.reduce<Record<string, RawCollectorEntry[]>>((acc, r) => {
    (acc[r.place_code] ??= []).push(r);
    return acc;
  }, {});

  const placeColumns: Column<ScrapedPlaceData>[] = [
    {
      key: "name",
      header: "Name",
      render: (p) => <span className="font-medium">{p.name}</span>,
    },
    {
      key: "id",
      header: "Place Code",
      render: (p) => (
        <span className="font-mono text-xs text-text-secondary dark:text-dark-text-secondary">
          {p._scraped_id}
        </span>
      ),
    },
    {
      key: "enrichment",
      header: "Enrichment",
      render: (p) => (
        <StatusBadge
          label={String(p._enrichment_status ?? "unknown")}
          variant={enrichVariant(String(p._enrichment_status ?? ""))}
        />
      ),
    },
    {
      key: "description_source",
      header: "Description Source",
      render: (p) => (
        <span className="text-sm text-text-secondary dark:text-dark-text-secondary">
          {p._description_source ?? "—"}
        </span>
      ),
    },
    {
      key: "score",
      header: "Score",
      render: (p) => (
        <span className="text-sm">
          {p._description_score != null ? p._description_score.toFixed(2) : "—"}
        </span>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-text-secondary dark:text-dark-text-secondary">
        Loading…
      </div>
    );
  }
  if (!run) return <div className="text-red-500">Run not found.</div>;

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate("/scraper/runs")}
        className="flex items-center gap-1.5 text-sm text-text-secondary dark:text-dark-text-secondary hover:text-text-main dark:hover:text-white"
      >
        <ArrowLeft size={16} /> Back to Runs
      </button>

      {/* Run info card */}
      <div className="rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-text-main dark:text-white font-mono">
              {run.run_code}
            </h1>
            <p className="text-xs text-text-secondary dark:text-dark-text-secondary mt-1">
              Location: {run.location_code} · Started: {formatDate(run.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge label={run.status} variant={statusVariant(run.status)} />
            {isActive && (
              <button
                onClick={() => void handleAction("cancel")}
                className="flex items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-700 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <XCircle size={13} /> Cancel
              </button>
            )}
            {isResumable && (
              <button
                onClick={() => void handleAction("resume")}
                className="flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                <Play size={13} /> Resume
              </button>
            )}
            {run.status === "completed" && (
              <>
                <button
                  onClick={() => void handleAction("sync")}
                  className="flex items-center gap-1.5 rounded-lg border border-input-border dark:border-dark-border px-3 py-1.5 text-xs font-medium text-text-secondary dark:text-dark-text-secondary hover:bg-background-light dark:hover:bg-dark-bg transition-colors"
                >
                  <UploadCloud size={13} /> Sync
                </button>
                <button
                  onClick={() => void handleAction("re-enrich")}
                  className="flex items-center gap-1.5 rounded-lg border border-input-border dark:border-dark-border px-3 py-1.5 text-xs font-medium text-text-secondary dark:text-dark-text-secondary hover:bg-background-light dark:hover:bg-dark-bg transition-colors"
                >
                  <RefreshCw size={13} /> Re-enrich
                </button>
              </>
            )}
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Overall progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-text-secondary dark:text-dark-text-secondary">
            <span>Progress</span>
            <span>
              {run.total_items != null
                ? `${run.processed_items.toLocaleString()} / ${run.total_items.toLocaleString()} places`
                : "Discovering…"}
            </span>
          </div>
          <div className="w-full bg-background-light dark:bg-dark-bg rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Stage pipeline */}
        {(() => {
          const stages = ["discovery", "detail_fetch", "image_download", "enrichment"];
          const currentStageIdx = run.stage ? stages.indexOf(run.stage) : -1;
          const isInterrupted = run.status === "interrupted";
          return (
            <div className="flex items-center gap-0 flex-wrap">
              {stages.map((s, i) => {
                const isDone = currentStageIdx > i || run.status === "completed";
                const isCurrent = currentStageIdx === i;
                return (
                  <div key={s} className="flex items-center">
                    <div
                      className={[
                        "px-2 py-1 rounded text-xs font-medium",
                        isDone
                          ? "bg-primary/10 text-primary"
                          : isCurrent
                          ? isInterrupted
                            ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
                            : "bg-primary/20 text-primary"
                          : "bg-background-light dark:bg-dark-bg text-text-secondary dark:text-dark-text-secondary",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {s.replace(/_/g, " ")}
                    </div>
                    {i < stages.length - 1 && (
                      <div className="w-4 h-px bg-input-border dark:bg-dark-border mx-0.5" />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Error message */}
        {run.error_message && (
          <div className="rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10 px-4 py-3">
            <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-0.5">Error</p>
            <p className="text-xs text-red-600 dark:text-red-300 font-mono break-words">
              {run.error_message}
            </p>
          </div>
        )}

        {/* Live activity panel — only while running */}
        {isActive && activity && (
          <LiveActivityPanel run={run} activity={activity} />
        )}
      </div>

      {/* Tabs */}
      <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List className="flex border-b border-input-border dark:border-dark-border">
          {[
            { value: "places", label: `Scraped Places (${total})` },
            { value: "cells", label: `Discovery Cells${activity ? ` (${activity.cells_total})` : ""}` },
            { value: "raw", label: `Raw Data (${rawData.length})` },
          ].map((tab) => (
            <Tabs.Trigger
              key={tab.value}
              value={tab.value}
              className="px-4 py-2.5 text-sm font-medium text-text-secondary dark:text-dark-text-secondary border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary transition-colors"
            >
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="places" className="pt-4 space-y-3">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by name…"
            className="w-64"
          />
          <DataTable
            columns={placeColumns}
            data={places}
            rowKey={(p) => String(p._scraped_id)}
            emptyMessage="No scraped places."
          />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </Tabs.Content>

        <Tabs.Content value="cells" className="pt-4">
          {runCode && <CellsTab runCode={runCode} />}
        </Tabs.Content>

        <Tabs.Content value="raw" className="pt-4 space-y-3">
          {Object.keys(groupedRaw).length === 0 ? (
            <p className="text-text-secondary dark:text-dark-text-secondary text-sm">
              No raw collector data available.
            </p>
          ) : (
            Object.entries(groupedRaw).map(([placeCode, entries]) => {
              const isExpanded = expandedRaw.has(placeCode);
              return (
                <div
                  key={placeCode}
                  className="rounded-xl border border-input-border dark:border-dark-border overflow-hidden"
                >
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 bg-background-light dark:bg-dark-bg text-left"
                    onClick={() =>
                      setExpandedRaw((prev) => {
                        const next = new Set(prev);
                        if (isExpanded) next.delete(placeCode);
                        else next.add(placeCode);
                        return next;
                      })
                    }
                  >
                    <span className="font-mono text-xs text-text-main dark:text-white">
                      {placeCode}
                    </span>
                    <span className="text-xs text-text-secondary dark:text-dark-text-secondary">
                      {entries.length} collector{entries.length !== 1 ? "s" : ""} ·{" "}
                      {isExpanded ? "Hide" : "Show"}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="divide-y divide-input-border dark:divide-dark-border">
                      {entries.map((entry) => (
                        <div key={entry.collector_name} className="px-4 py-3 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-text-main dark:text-white">
                              {entry.collector_name}
                            </span>
                            <StatusBadge
                              label={entry.status}
                              variant={
                                entry.status === "success"
                                  ? "success"
                                  : entry.status === "failed"
                                  ? "danger"
                                  : "neutral"
                              }
                            />
                          </div>
                          {entry.error_message && (
                            <p className="text-xs text-red-500">{entry.error_message}</p>
                          )}
                          <pre className="mt-2 text-xs bg-background-light dark:bg-dark-bg rounded-lg p-3 overflow-x-auto text-text-secondary dark:text-dark-text-secondary whitespace-pre-wrap break-words">
                            {JSON.stringify(entry.raw_response, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </Tabs.Content>
      </Tabs.Root>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete run?"
        description={`Permanently delete run "${run.run_code}" and all its scraped data?`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
