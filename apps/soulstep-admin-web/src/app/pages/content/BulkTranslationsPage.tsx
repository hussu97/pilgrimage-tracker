import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteTranslationJob,
  exportUntranslatedTxt,
  importTranslationTxt,
  listTranslationJobs,
} from "@/lib/api/admin";
import type { BulkTranslationJob } from "@/lib/api/types";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Pagination } from "@/components/shared/Pagination";
import { StatCard } from "@/components/shared/StatCard";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatDate } from "@/lib/utils";
import { Zap, X, Trash2, Download, Upload } from "lucide-react";

// ── Status badge colors (dark-mode safe) ──────────────────────────────────────

export const STATUS_COLORS: Record<string, string> = {
  pending:
    "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20",
  running:
    "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20",
  completed:
    "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20",
  completed_with_errors:
    "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20",
  failed:
    "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20",
  cancelled:
    "text-gray-500 dark:text-dark-text-secondary bg-gray-100 dark:bg-dark-surface",
};

// ── Progress computation (exported for tests) ─────────────────────────────────

export function computeProgress(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, (completed / total) * 100);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BulkTranslationsPage() {
  const { page, pageSize, setPage, setPageSize } = usePagination(50);
  const [jobs, setJobs] = useState<BulkTranslationJob[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const resp = await listTranslationJobs({ page, page_size: pageSize });
      setJobs(resp.items);
      setTotal(resp.total);
    } catch {
      setJobs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // Derived stat counts
  const totalJobs = total;
  const runningJobs = jobs.filter((j) => j.status === "running" || j.status === "pending").length;
  const completedJobs = jobs.filter(
    (j) => j.status === "completed" || j.status === "completed_with_errors"
  ).length;
  const failedJobs = jobs.filter((j) => j.status === "failed" || j.status === "cancelled").length;

  const handleDelete = async (jobCode: string) => {
    if (!window.confirm("Delete this job record?")) return;
    await deleteTranslationJob(jobCode);
    await load();
  };

  // ── Manual Translation (.txt Bulk Translator workflow) ────────────────────────

  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importToast, setImportToast] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importLang, setImportLang] = useState<string>("ar");

  const EXPORT_ENTITY_TYPES = ["place", "city", "attribute_def", "review"] as const;
  const [exportEntityTypes, setExportEntityTypes] = useState<string[]>([...EXPORT_ENTITY_TYPES]);

  const toggleExportType = (type: string) => {
    setExportEntityTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleExport = async () => {
    if (exportEntityTypes.length === 0) return;
    setExportLoading(true);
    try {
      await exportUntranslatedTxt(exportEntityTypes.join(","));
    } finally {
      setExportLoading(false);
    }
  };

  const handleImport = async (file: File) => {
    setImportLoading(true);
    setImportToast(null);
    try {
      const job = await importTranslationTxt(importLang, file);
      setImportToast(
        `Import complete: ${job.completed_items} translations saved` +
          (job.failed_items > 0 ? ` (${job.failed_items} errors)` : "")
      );
      await load();
    } catch (err) {
      setImportToast(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImportLoading(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const columns: Column<BulkTranslationJob>[] = [
    {
      key: "job_code",
      header: "Job Code",
      render: (row) => (
        <span className="font-mono text-xs text-text-secondary dark:text-dark-text-secondary">
          {row.job_code}
        </span>
      ),
    },
    {
      key: "job_type",
      header: "Type",
      render: (row) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            row.job_type === "import"
              ? "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20"
              : "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
          }`}
        >
          {row.job_type === "import" ? "Import" : "Browser"}
        </span>
      ),
    },
    {
      key: "langs",
      header: "Languages",
      render: (row) => (
        <span className="text-xs">
          {(row.target_langs || []).join(", ") || "—"}
        </span>
      ),
    },
    {
      key: "entity_types",
      header: "Entities",
      render: (row) => (
        <span className="text-xs capitalize">
          {(row.entity_types || []).join(", ") || "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
            STATUS_COLORS[row.status] ?? "text-text-secondary dark:text-dark-text-secondary bg-gray-100 dark:bg-dark-surface"
          }`}
        >
          {row.status.replace(/_/g, " ")}
        </span>
      ),
    },
    {
      key: "progress",
      header: "Progress",
      className: "min-w-[140px]",
      render: (row) => (
        <div className="w-full">
          <div className="flex justify-between text-xs text-text-secondary dark:text-dark-text-secondary mb-1">
            <span>
              {row.completed_items}/{row.total_items}
            </span>
            <span>{row.progress_pct.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 bg-background-light dark:bg-dark-border rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${row.progress_pct}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      key: "started_at",
      header: "Started",
      render: (row) => (
        <span className="text-xs text-text-secondary dark:text-dark-text-secondary">
          {row.started_at ? formatDate(row.started_at) : "—"}
        </span>
      ),
    },
    {
      key: "items",
      header: "Items",
      render: (row) => (
        <div className="text-xs space-y-0.5">
          <div className="text-green-600 dark:text-green-400">{row.completed_items} ok</div>
          {row.failed_items > 0 && (
            <div className="text-red-500">{row.failed_items} fail</div>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <div className="flex items-center gap-1">
          <button
            title="Delete job"
            onClick={(e) => {
              e.stopPropagation();
              void handleDelete(row.job_code);
            }}
            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-main dark:text-white flex items-center gap-2">
            <Zap size={20} className="text-primary" />
            Bulk Translations
          </h1>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-0.5">
            View translation jobs run by the Cloud Run translate_content job.
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Jobs" value={totalJobs} />
        <StatCard label="Active" value={runningJobs} />
        <StatCard label="Completed" value={completedJobs} />
        <StatCard label="Failed / Cancelled" value={failedJobs} />
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={jobs}
        loading={loading}
        rowKey={(r) => r.job_code}
        emptyMessage="No bulk translation jobs yet. Jobs are created by the Cloud Run translate_content job."
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {/* Manual Translation (Bulk Translator) Card */}
      <div className="rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-text-main dark:text-white flex items-center gap-2">
            <span className="material-icons text-base text-primary">translate</span>
            Manual Translation (Bulk Translator)
          </h2>
          <p className="text-xs text-text-secondary dark:text-dark-text-secondary mt-1">
            Export missing translations as a .txt file, paste into a bulk translator site, then upload the translated .txt for a single language at a time.
          </p>
        </div>

        {/* Entity type filter for export */}
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-text-secondary dark:text-dark-text-secondary">Export types:</p>
          {(
            [
              { value: "place", label: "Places" },
              { value: "city", label: "Cities" },
              { value: "attribute_def", label: "Attributes" },
              { value: "review", label: "Reviews" },
            ] as const
          ).map(({ value, label }) => (
            <label key={value} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={exportEntityTypes.includes(value)}
                onChange={() => toggleExportType(value)}
                className="h-4 w-4 rounded border-input-border dark:border-dark-border accent-primary"
              />
              <span className="text-sm text-text-main dark:text-white">{label}</span>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          {/* Export */}
          <button
            onClick={() => void handleExport()}
            disabled={exportLoading || exportEntityTypes.length === 0}
            className="flex items-center gap-2 rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-4 py-2 text-sm font-medium text-text-main dark:text-white hover:bg-background-light dark:hover:bg-dark-surface disabled:opacity-50 transition-colors"
          >
            <Download size={14} />
            {exportLoading ? "Exporting…" : "Download untranslated (.txt)"}
          </button>

          {/* Import language selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary dark:text-dark-text-secondary whitespace-nowrap">
              Import language:
            </label>
            <select
              value={importLang}
              onChange={(e) => setImportLang(e.target.value)}
              className="rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-2 py-1.5 text-sm text-text-main dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="ar">ar — Arabic</option>
              <option value="hi">hi — Hindi</option>
              <option value="te">te — Telugu</option>
              <option value="ml">ml — Malayalam</option>
            </select>
          </div>

          {/* Import */}
          <label
            className={`flex items-center gap-2 rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-4 py-2 text-sm font-medium text-text-main dark:text-white hover:bg-background-light dark:hover:bg-dark-surface transition-colors cursor-pointer ${importLoading ? "opacity-50 pointer-events-none" : ""}`}
          >
            <Upload size={14} />
            {importLoading ? "Importing…" : "Upload translated (.txt)"}
            <input
              ref={importInputRef}
              type="file"
              accept=".txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImport(file);
              }}
            />
          </label>
        </div>

        {/* Result toast */}
        {importToast && (
          <div className="flex items-start justify-between gap-2 rounded-lg bg-background-light dark:bg-dark-bg border border-input-border dark:border-dark-border px-4 py-3">
            <p className="text-sm text-text-main dark:text-white">{importToast}</p>
            <button
              onClick={() => setImportToast(null)}
              className="text-text-secondary dark:text-dark-text-secondary hover:text-text-main dark:hover:text-white transition-colors flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
