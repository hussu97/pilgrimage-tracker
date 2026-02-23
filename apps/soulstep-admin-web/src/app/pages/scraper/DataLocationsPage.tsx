import { useCallback, useEffect, useState } from "react";
import {
  createDataLocation,
  deleteDataLocation,
  listDataLocations,
} from "@/lib/api/scraper";
import type { DataLocation } from "@/lib/api/types";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatDate } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";

interface CreateForm {
  name: string;
  mode: "city" | "country";
  value: string;
  max_results: string;
}

const INITIAL_FORM: CreateForm = { name: "", mode: "city", value: "", max_results: "20" };

export function DataLocationsPage() {
  const [locations, setLocations] = useState<DataLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DataLocation | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLocations(await listDataLocations());
    } catch {
      setLocations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name || !form.value) return;
    setSubmitting(true);
    try {
      const body = {
        name: form.name,
        [form.mode]: form.value,
        max_results: Number(form.max_results) || 20,
      };
      await createDataLocation(body);
      setForm(INITIAL_FORM);
      setShowCreate(false);
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteDataLocation(deleteTarget.code);
    setDeleteTarget(null);
    await load();
  };

  const columns: Column<DataLocation>[] = [
    {
      key: "code",
      header: "Code",
      render: (l) => (
        <span className="font-mono text-xs text-text-secondary dark:text-dark-text-secondary">
          {l.code}
        </span>
      ),
    },
    { key: "name", header: "Name", render: (l) => l.name },
    {
      key: "source",
      header: "Source",
      render: (l) => l.source_type,
    },
    {
      key: "config",
      header: "Location",
      render: (l) => {
        const cfg = l.config as Record<string, unknown>;
        return String(cfg.city ?? cfg.country ?? "—");
      },
    },
    {
      key: "created_at",
      header: "Created",
      render: (l) => (
        <span className="text-text-secondary dark:text-dark-text-secondary text-sm">
          {formatDate(l.created_at)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (l) => (
        <button
          onClick={(e) => { e.stopPropagation(); setDeleteTarget(l); }}
          className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-main dark:text-white">Data Locations</h1>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Plus size={15} />
          New Location
        </button>
      </div>

      {/* Inline create form */}
      {showCreate && (
        <div className="rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-5 space-y-4">
          <h2 className="text-sm font-semibold text-text-main dark:text-white">New Location</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">
                Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Dubai Mosques"
                className="w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-text-main dark:text-white outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">
                Max Results
              </label>
              <input
                type="number"
                value={form.max_results}
                onChange={(e) => setForm((f) => ({ ...f, max_results: e.target.value }))}
                className="w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-text-main dark:text-white outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">
                Scope
              </label>
              <div className="flex gap-3">
                {(["city", "country"] as const).map((m) => (
                  <label key={m} className="flex items-center gap-1.5 text-sm text-text-main dark:text-white cursor-pointer">
                    <input
                      type="radio"
                      checked={form.mode === m}
                      onChange={() => setForm((f) => ({ ...f, mode: m, value: "" }))}
                    />
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">
                {form.mode === "city" ? "City" : "Country"}
              </label>
              <input
                type="text"
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                placeholder={form.mode === "city" ? "e.g. Dubai" : "e.g. UAE"}
                className="w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-text-main dark:text-white outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              disabled={submitting || !form.name || !form.value}
              onClick={() => void handleCreate()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Creating…" : "Create"}
            </button>
            <button
              onClick={() => { setShowCreate(false); setForm(INITIAL_FORM); }}
              className="rounded-lg border border-input-border dark:border-dark-border px-4 py-2 text-sm font-medium text-text-secondary dark:text-dark-text-secondary hover:bg-background-light dark:hover:bg-dark-bg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={locations}
        loading={loading}
        rowKey={(l) => l.code}
        emptyMessage="No data locations configured."
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete location?"
        description={`Delete "${deleteTarget?.name}" and all its runs and scraped data? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
