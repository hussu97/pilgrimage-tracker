import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  cancelRun,
  deleteRun,
  listDataLocations,
  listRuns,
  reEnrichRun,
  startRun,
  syncRun,
} from "@/lib/api/scraper";
import type { DataLocation, ScraperRun } from "@/lib/api/types";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Pagination } from "@/components/shared/Pagination";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatDate } from "@/lib/utils";
import { Play, RefreshCw, Trash2, XCircle, UploadCloud } from "lucide-react";

type RunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

function statusVariant(s: string) {
  if (s === "completed") return "success" as const;
  if (s === "failed") return "danger" as const;
  if (s === "running") return "info" as const;
  if (s === "cancelled") return "warning" as const;
  return "neutral" as const;
}

const ACTIVE_STATUSES: RunStatus[] = ["pending", "running"];

export function ScraperRunsPage() {
  const navigate = useNavigate();
  const { page, pageSize, setPage, setPageSize } = usePagination(50);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [data, setData] = useState<{ items: ScraperRun[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<DataLocation[]>([]);
  const [showStart, setShowStart] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [starting, setStarting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ScraperRun | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Parameters<typeof listRuns>[0] = { page, page_size: pageSize };
      if (statusFilter) params.status = statusFilter;
      setData(await listRuns(params));
    } catch {
      setData({ items: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    void listDataLocations().then(setLocations).catch(() => setLocations([]));
  }, []);

  const handleStart = async () => {
    if (!selectedLocation) return;
    setStarting(true);
    try {
      await startRun(selectedLocation);
      setShowStart(false);
      setSelectedLocation("");
      await load();
    } finally {
      setStarting(false);
    }
  };

  const handleAction = async (action: string, runCode: string) => {
    try {
      if (action === "cancel") await cancelRun(runCode);
      else if (action === "sync") await syncRun(runCode);
      else if (action === "re-enrich") await reEnrichRun(runCode);
      await load();
    } catch {
      /* errors are silently ignored for now */
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteRun(deleteTarget.run_code);
    setDeleteTarget(null);
    await load();
  };

  const progressPercent = (run: ScraperRun) => {
    if (!run.total_items || run.total_items === 0) return 0;
    return Math.min(100, Math.round((run.processed_items / run.total_items) * 100));
  };

  const columns: Column<ScraperRun>[] = [
    {
      key: "run_code",
      header: "Run",
      render: (r) => (
        <span className="font-mono text-xs text-text-secondary dark:text-dark-text-secondary">
          {r.run_code}
        </span>
      ),
    },
    {
      key: "location",
      header: "Location",
      render: (r) => {
        const loc = locations.find((l) => l.code === r.location_code);
        return loc?.name ?? r.location_code;
      },
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusBadge label={r.status} variant={statusVariant(r.status)} />,
    },
    {
      key: "progress",
      header: "Progress",
      render: (r) => {
        const pct = progressPercent(r);
        return (
          <div className="flex items-center gap-2 min-w-[100px]">
            <div className="flex-1 bg-background-light dark:bg-dark-bg rounded-full h-1.5">
              <div
                className="bg-primary h-1.5 rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-text-secondary dark:text-dark-text-secondary whitespace-nowrap">
              {r.total_items != null
                ? `${r.processed_items}/${r.total_items}`
                : "—"}
            </span>
          </div>
        );
      },
    },
    {
      key: "started_at",
      header: "Started",
      render: (r) => (
        <span className="text-sm text-text-secondary dark:text-dark-text-secondary">
          {formatDate(r.created_at)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {ACTIVE_STATUSES.includes(r.status as RunStatus) && (
            <button
              title="Cancel"
              onClick={() => void handleAction("cancel", r.run_code)}
              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
            >
              <XCircle size={14} />
            </button>
          )}
          {r.status === "completed" && (
            <>
              <button
                title="Sync to main DB"
                onClick={() => void handleAction("sync", r.run_code)}
                className="p-1.5 rounded hover:bg-background-light dark:hover:bg-dark-bg text-text-secondary dark:text-dark-text-secondary transition-colors"
              >
                <UploadCloud size={14} />
              </button>
              <button
                title="Re-enrich"
                onClick={() => void handleAction("re-enrich", r.run_code)}
                className="p-1.5 rounded hover:bg-background-light dark:hover:bg-dark-bg text-text-secondary dark:text-dark-text-secondary transition-colors"
              >
                <RefreshCw size={14} />
              </button>
            </>
          )}
          <button
            title="Delete"
            onClick={() => setDeleteTarget(r)}
            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-text-main dark:text-white">Scraper Runs</h1>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-sm text-text-main dark:text-white outline-none focus:border-primary"
          >
            <option value="">All statuses</option>
            {(["pending", "running", "completed", "failed", "cancelled"] as RunStatus[]).map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <button
            onClick={() => setShowStart((v) => !v)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            <Play size={14} />
            Start Run
          </button>
        </div>
      </div>

      {showStart && (
        <div className="rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-5 space-y-4">
          <h2 className="text-sm font-semibold text-text-main dark:text-white">Start New Run</h2>
          <div className="flex gap-3 flex-wrap">
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-text-main dark:text-white outline-none focus:border-primary"
            >
              <option value="">Select a location…</option>
              {locations.map((l) => (
                <option key={l.code} value={l.code}>{l.name}</option>
              ))}
            </select>
            <button
              disabled={starting || !selectedLocation}
              onClick={() => void handleStart()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {starting ? "Starting…" : "Start"}
            </button>
            <button
              onClick={() => { setShowStart(false); setSelectedLocation(""); }}
              className="rounded-lg border border-input-border dark:border-dark-border px-4 py-2 text-sm font-medium text-text-secondary dark:text-dark-text-secondary hover:bg-background-light dark:hover:bg-dark-bg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        loading={loading}
        rowKey={(r) => r.run_code}
        onRowClick={(r) => navigate(`/scraper/runs/${r.run_code}`)}
        emptyMessage="No runs found."
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete run?"
        description={`Delete run "${deleteTarget?.run_code}" and all its scraped data?`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
