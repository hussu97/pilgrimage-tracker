import { useCallback, useEffect, useState } from "react";
import {
  createPlaceTypeMapping,
  deletePlaceTypeMapping,
  listPlaceTypeMappings,
  updatePlaceTypeMapping,
} from "@/lib/api/scraper";
import type { PlaceTypeMapping } from "@/lib/api/types";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";

const RELIGIONS = ["islam", "christianity", "hinduism", "buddhism", "judaism", "sikhism"];

interface CreateForm {
  religion: string;
  gmaps_type: string;
  our_place_type: string;
  is_active: boolean;
  display_order: string;
}

const INITIAL_FORM: CreateForm = {
  religion: "islam",
  gmaps_type: "",
  our_place_type: "",
  is_active: true,
  display_order: "0",
};

export function PlaceTypeMappingsPage() {
  const [mappings, setMappings] = useState<PlaceTypeMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [religionFilter, setReligionFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<PlaceTypeMapping>>({});
  const [deleteTarget, setDeleteTarget] = useState<PlaceTypeMapping | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { religion?: string } = {};
      if (religionFilter) params.religion = religionFilter;
      setMappings(await listPlaceTypeMappings(params));
    } catch {
      setMappings([]);
    } finally {
      setLoading(false);
    }
  }, [religionFilter]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async () => {
    if (!form.gmaps_type || !form.our_place_type) return;
    setSubmitting(true);
    try {
      await createPlaceTypeMapping({
        religion: form.religion,
        gmaps_type: form.gmaps_type,
        our_place_type: form.our_place_type,
        is_active: form.is_active,
        display_order: Number(form.display_order) || 0,
      });
      setForm(INITIAL_FORM);
      setShowCreate(false);
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (id: number) => {
    await updatePlaceTypeMapping(id, editForm);
    setEditingId(null);
    setEditForm({});
    await load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deletePlaceTypeMapping(deleteTarget.id);
    setDeleteTarget(null);
    await load();
  };

  const handleToggleActive = async (m: PlaceTypeMapping) => {
    await updatePlaceTypeMapping(m.id, { is_active: !m.is_active });
    await load();
  };

  const columns: Column<PlaceTypeMapping>[] = [
    {
      key: "religion",
      header: "Religion",
      render: (m) =>
        editingId === m.id ? (
          <select
            value={editForm.religion ?? m.religion}
            onChange={(e) => setEditForm((f) => ({ ...f, religion: e.target.value }))}
            className="rounded border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-2 py-1 text-xs"
          >
            {RELIGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        ) : (
          <span className="capitalize">{m.religion}</span>
        ),
    },
    {
      key: "gmaps_type",
      header: "GMaps Type",
      render: (m) =>
        editingId === m.id ? (
          <input
            value={editForm.gmaps_type ?? m.gmaps_type}
            onChange={(e) => setEditForm((f) => ({ ...f, gmaps_type: e.target.value }))}
            className="rounded border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-2 py-1 text-xs w-full"
          />
        ) : (
          <span className="font-mono text-xs">{m.gmaps_type}</span>
        ),
    },
    {
      key: "our_place_type",
      header: "Our Type",
      render: (m) =>
        editingId === m.id ? (
          <input
            value={editForm.our_place_type ?? m.our_place_type}
            onChange={(e) => setEditForm((f) => ({ ...f, our_place_type: e.target.value }))}
            className="rounded border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-2 py-1 text-xs w-full"
          />
        ) : (
          <span className="font-mono text-xs">{m.our_place_type}</span>
        ),
    },
    {
      key: "is_active",
      header: "Active",
      render: (m) => (
        <button onClick={() => void handleToggleActive(m)}>
          <StatusBadge
            label={m.is_active ? "Active" : "Inactive"}
            variant={m.is_active ? "success" : "neutral"}
          />
        </button>
      ),
    },
    {
      key: "display_order",
      header: "Order",
      render: (m) =>
        editingId === m.id ? (
          <input
            type="number"
            value={editForm.display_order ?? m.display_order}
            onChange={(e) =>
              setEditForm((f) => ({ ...f, display_order: Number(e.target.value) }))
            }
            className="rounded border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-2 py-1 text-xs w-16"
          />
        ) : (
          m.display_order
        ),
    },
    {
      key: "actions",
      header: "",
      render: (m) =>
        editingId === m.id ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => void handleSaveEdit(m.id)}
              className="p-1.5 rounded hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 dark:text-green-400 transition-colors"
            >
              <Check size={14} />
            </button>
            <button
              onClick={() => { setEditingId(null); setEditForm({}); }}
              className="p-1.5 rounded hover:bg-background-light dark:hover:bg-dark-bg text-text-secondary dark:text-dark-text-secondary transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingId(m.id);
                setEditForm({ religion: m.religion, gmaps_type: m.gmaps_type, our_place_type: m.our_place_type, display_order: m.display_order });
              }}
              className="p-1.5 rounded hover:bg-background-light dark:hover:bg-dark-bg text-text-secondary dark:text-dark-text-secondary transition-colors"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setDeleteTarget(m); }}
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
        <h1 className="text-xl font-semibold text-text-main dark:text-white">Place Type Mappings</h1>
        <div className="flex items-center gap-2">
          <select
            value={religionFilter}
            onChange={(e) => setReligionFilter(e.target.value)}
            className="rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-sm text-text-main dark:text-white outline-none focus:border-primary"
          >
            <option value="">All religions</option>
            {RELIGIONS.map((r) => (
              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
            ))}
          </select>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            <Plus size={15} />
            New Mapping
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-5 space-y-4">
          <h2 className="text-sm font-semibold text-text-main dark:text-white">New Mapping</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">Religion</label>
              <select
                value={form.religion}
                onChange={(e) => setForm((f) => ({ ...f, religion: e.target.value }))}
                className="w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-text-main dark:text-white outline-none focus:border-primary"
              >
                {RELIGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">GMaps Type</label>
              <input
                value={form.gmaps_type}
                onChange={(e) => setForm((f) => ({ ...f, gmaps_type: e.target.value }))}
                placeholder="e.g. mosque"
                className="w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-text-main dark:text-white outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">Our Place Type</label>
              <input
                value={form.our_place_type}
                onChange={(e) => setForm((f) => ({ ...f, our_place_type: e.target.value }))}
                placeholder="e.g. mosque"
                className="w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-text-main dark:text-white outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">Display Order</label>
              <input
                type="number"
                value={form.display_order}
                onChange={(e) => setForm((f) => ({ ...f, display_order: e.target.value }))}
                className="w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-text-main dark:text-white outline-none focus:border-primary"
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-text-main dark:text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Active
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              disabled={submitting || !form.gmaps_type || !form.our_place_type}
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
        data={mappings}
        loading={loading}
        rowKey={(m) => String(m.id)}
        emptyMessage="No place type mappings found."
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete mapping?"
        description={`Delete mapping "${deleteTarget?.gmaps_type}" → "${deleteTarget?.our_place_type}"?`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
