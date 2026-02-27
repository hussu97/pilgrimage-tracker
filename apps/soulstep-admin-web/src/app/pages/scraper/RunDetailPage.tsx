import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as Tabs from "@radix-ui/react-tabs";
import {
  cancelRun,
  deleteRun,
  getRun,
  getRunData,
  getRunRawData,
  reEnrichRun,
  resumeRun,
  syncRun,
} from "@/lib/api/scraper";
import type { RawCollectorEntry, ScrapedPlaceData, ScraperRun } from "@/lib/api/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { SearchInput } from "@/components/shared/SearchInput";
import { usePolling } from "@/lib/hooks/usePolling";
import { formatDate } from "@/lib/utils";
import { statusVariant } from "@/lib/utils/scraperStatus";
import { ArrowLeft, Play, RefreshCw, Trash2, UploadCloud, XCircle } from "lucide-react";

function enrichVariant(s: string) {
  if (s === "complete") return "success" as const;
  if (s === "failed") return "danger" as const;
  if (s === "enriching") return "info" as const;
  return "neutral" as const;
}

export function RunDetailPage() {
  const { runCode } = useParams<{ runCode: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<ScraperRun | null>(null);
  const [places, setPlaces] = useState<ScrapedPlaceData[]>([]);
  const [rawData, setRawData] = useState<RawCollectorEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expandedRaw, setExpandedRaw] = useState<Set<string>>(new Set());

  const loadRun = useCallback(async () => {
    if (!runCode) return;
    try {
      setRun(await getRun(runCode));
    } catch {/* ignore */}
  }, [runCode]);

  const loadData = useCallback(async () => {
    if (!runCode) return;
    try {
      const [p, r] = await Promise.all([
        getRunData(runCode, search || undefined),
        getRunRawData(runCode),
      ]);
      setPlaces(p);
      setRawData(r);
    } catch {
      setPlaces([]);
      setRawData([]);
    }
  }, [runCode, search]);

  useEffect(() => {
    if (!runCode) return;
    setLoading(true);
    void Promise.all([loadRun(), loadData()]).finally(() => setLoading(false));
  }, [loadRun, loadData, runCode]);

  const isActive = run?.status === "pending" || run?.status === "running";
  const isResumable = run?.status === "interrupted" || run?.status === "failed";
  usePolling(loadRun, 3000, isActive);

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

        {/* Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-text-secondary dark:text-dark-text-secondary">
            <span>Progress</span>
            <span>
              {run.total_items != null
                ? `${run.processed_items} / ${run.total_items} places`
                : "Discovering…"}
            </span>
          </div>
          <div className="w-full bg-background-light dark:bg-dark-bg rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Stage pipeline indicator */}
        {(() => {
          const stages = ["discovery", "detail_fetch", "enrichment"];
          const currentStageIdx = run.stage ? stages.indexOf(run.stage) : -1;
          const isInterrupted = run.status === "interrupted";
          return (
            <div className="flex items-center gap-0">
              {stages.map((s, i) => {
                const isDone = currentStageIdx > i || run.status === "completed";
                const isCurrent = currentStageIdx === i;
                return (
                  <div key={s} className="flex items-center">
                    <div className={[
                      "px-2 py-1 rounded text-xs font-medium",
                      isDone
                        ? "bg-primary/10 text-primary"
                        : isCurrent
                        ? isInterrupted
                          ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
                          : "bg-primary/20 text-primary"
                        : "bg-background-light dark:bg-dark-bg text-text-secondary dark:text-dark-text-secondary",
                    ].filter(Boolean).join(" ")}>
                      {s.replace("_", " ")}
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
            <p className="text-xs text-red-600 dark:text-red-300 font-mono break-words">{run.error_message}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs.Root defaultValue="places">
        <Tabs.List className="flex border-b border-input-border dark:border-dark-border">
          {["places", "raw"].map((tab) => (
            <Tabs.Trigger
              key={tab}
              value={tab}
              className="px-4 py-2.5 text-sm font-medium text-text-secondary dark:text-dark-text-secondary border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary transition-colors"
            >
              {tab === "places" ? `Scraped Places (${places.length})` : `Raw Data (${rawData.length})`}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="places" className="pt-4 space-y-3">
          <SearchInput
            value={search}
            onChange={(v) => { setSearch(v); void loadData(); }}
            placeholder="Search by name…"
            className="w-64"
          />
          <DataTable
            columns={placeColumns}
            data={places}
            rowKey={(p) => String(p._scraped_id)}
            emptyMessage="No scraped places."
          />
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
