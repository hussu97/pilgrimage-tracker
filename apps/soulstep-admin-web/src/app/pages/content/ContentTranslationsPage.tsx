import { useCallback, useEffect, useState } from "react";
import {
  createContentTranslation,
  deleteContentTranslation,
  listContentTranslations,
  updateContentTranslation,
} from "@/lib/api/admin";
import type { AdminContentTranslation } from "@/lib/api/types";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Pagination } from "@/components/shared/Pagination";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";

const ENTITY_TYPES = ["place", "attribute_def", "spec_value"];
const LANGS = ["ar", "hi", "te", "ml"];
const FIELDS = ["name", "description", "address", "label", "value"];

interface CreateForm {
  entity_type: string;
  entity_code: string;
  field: string;
  lang: string;
  translated_text: string;
  source: string;
}

const EMPTY_FORM: CreateForm = {
  entity_type: "place",
  entity_code: "",
  field: "name",
  lang: "ar",
  translated_text: "",
  source: "manual",
};

export function ContentTranslationsPage() {
  const [items, setItems] = useState<AdminContentTranslation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [langFilter, setLangFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminContentTranslation | null>(null);

  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, page_size: PAGE_SIZE };
      if (entityTypeFilter) params.entity_type = entityTypeFilter;
      if (langFilter) params.lang = langFilter;
      const resp = await listContentTranslations(params as Parameters<typeof listContentTranslations>[0]);
      setItems(resp.items);
      setTotal(resp.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, entityTypeFilter, langFilter]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async () => {
    if (!createForm.entity_code || !createForm.translated_text) return;
    setCreating(true);
    try {
      await createContentTranslation(createForm);
      setCreateForm(EMPTY_FORM);
      setShowCreate(false);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleSaveEdit = async (id: number) => {
    await updateContentTranslation(id, { translated_text: editText });
    setEditingId(null);
    await load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteContentTranslation(deleteTarget.id);
    setDeleteTarget(null);
    await load();
  };

  const columns: Column<AdminContentTranslation>[] = [
    {
      key: "entity_type",
      header: "Type",
      render: (r) => (
        <span className="font-mono text-xs capitalize">{r.entity_type}</span>
      ),
    },
    {
      key: "entity_code",
      header: "Entity Code",
      render: (r) => (
        <div>
          <span className="font-mono text-xs">{r.entity_code}</span>
          {r.place_name && (
            <div className="text-xs text-text-secondary dark:text-dark-text-secondary mt-0.5">
              {r.place_name}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "field",
      header: "Field",
      render: (r) => <span className="text-xs">{r.field}</span>,
    },
    {
      key: "lang",
      header: "Lang",
      render: (r) => (
        <span className="font-mono text-xs uppercase font-semibold text-primary">{r.lang}</span>
      ),
    },
    {
      key: "translated_text",
      header: "Translation",
      render: (r) =>
        editingId === r.id ? (
          <div className="flex items-start gap-1">
            <textarea
              autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={2}
              className="flex-1 rounded border border-primary bg-white dark:bg-dark-bg px-2 py-1 text-xs text-text-main dark:text-white outline-none resize-none"
            />
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => void handleSaveEdit(r.id)}
                className="p-1 rounded hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 dark:text-green-400"
              >
                <Check size={13} />
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="p-1 rounded hover:bg-background-light dark:hover:bg-dark-bg text-text-secondary dark:text-dark-text-secondary"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        ) : (
          <span className="text-xs text-text-main dark:text-white">{r.translated_text}</span>
        ),
    },
    {
      key: "source",
      header: "Source",
      render: (r) => (
        <span className="text-xs text-text-secondary dark:text-dark-text-secondary capitalize">
          {r.source}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditingId(r.id);
              setEditText(r.translated_text);
            }}
            className="p-1.5 rounded hover:bg-background-light dark:hover:bg-dark-bg text-text-secondary dark:text-dark-text-secondary transition-colors"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }}
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
          <h1 className="text-xl font-semibold text-text-main dark:text-white">Content Translations</h1>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-0.5">
            Manage translated names and descriptions for places and attributes.
          </p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Plus size={15} />
          Add Translation
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-5 space-y-4">
          <h2 className="text-sm font-semibold text-text-main dark:text-white">New Translation</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">Entity Type</label>
              <select
                value={createForm.entity_type}
                onChange={(e) => setCreateForm((f) => ({ ...f, entity_type: e.target.value }))}
                className="w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-text-main dark:text-white outline-none focus:border-primary"
              >
                {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">Entity Code</label>
              <input
                value={createForm.entity_code}
                onChange={(e) => setCreateForm((f) => ({ ...f, entity_code: e.target.value }))}
                placeholder="e.g. plc_abc123"
                className="w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-text-main dark:text-white outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">Field</label>
              <select
                value={createForm.field}
                onChange={(e) => setCreateForm((f) => ({ ...f, field: e.target.value }))}
                className="w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-text-main dark:text-white outline-none focus:border-primary"
              >
                {FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">Language</label>
              <select
                value={createForm.lang}
                onChange={(e) => setCreateForm((f) => ({ ...f, lang: e.target.value }))}
                className="w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-text-main dark:text-white outline-none focus:border-primary"
              >
                {LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">Source</label>
              <select
                value={createForm.source}
                onChange={(e) => setCreateForm((f) => ({ ...f, source: e.target.value }))}
                className="w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-text-main dark:text-white outline-none focus:border-primary"
              >
                {["manual", "scraper", "google_translate"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2 md:col-span-3">
              <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">Translated Text</label>
              <textarea
                value={createForm.translated_text}
                onChange={(e) => setCreateForm((f) => ({ ...f, translated_text: e.target.value }))}
                rows={2}
                className="w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-text-main dark:text-white outline-none focus:border-primary resize-none"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              disabled={creating || !createForm.entity_code || !createForm.translated_text}
              onClick={() => void handleCreate()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button
              onClick={() => { setShowCreate(false); setCreateForm(EMPTY_FORM); }}
              className="rounded-lg border border-input-border dark:border-dark-border px-4 py-2 text-sm font-medium text-text-secondary dark:text-dark-text-secondary hover:bg-background-light dark:hover:bg-dark-bg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={entityTypeFilter}
          onChange={(e) => { setEntityTypeFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-sm text-text-main dark:text-white outline-none focus:border-primary"
        >
          <option value="">All entity types</option>
          {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={langFilter}
          onChange={(e) => { setLangFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-sm text-text-main dark:text-white outline-none focus:border-primary"
        >
          <option value="">All languages</option>
          {LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <span className="text-xs text-text-secondary dark:text-dark-text-secondary">
          {total} total
        </span>
      </div>

      <DataTable
        columns={columns}
        data={items}
        loading={loading}
        rowKey={(r) => String(r.id)}
        emptyMessage="No content translations found."
      />

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete translation?"
        description={`Delete ${deleteTarget?.lang} translation for "${deleteTarget?.entity_code}" (${deleteTarget?.field})?`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
