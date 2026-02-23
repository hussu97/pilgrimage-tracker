import { useCallback, useEffect, useState } from "react";
import {
  createTranslation,
  deleteTranslationOverrides,
  listLanguages,
  listTranslations,
  upsertTranslation,
} from "@/lib/api/admin";
import type { Language, TranslationEntry } from "@/lib/api/types";
import { SearchInput } from "@/components/shared/SearchInput";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Plus, RotateCcw, Check, X } from "lucide-react";

interface EditState {
  key: string;
  lang: string;
  value: string;
}

interface NewKeyForm {
  key: string;
  values: Record<string, string>;
}

export function TranslationsPage() {
  const [langs, setLangs] = useState<Language[]>([]);
  const [entries, setEntries] = useState<TranslationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TranslationEntry | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newForm, setNewForm] = useState<NewKeyForm>({ key: "", values: {} });
  const [creating, setCreating] = useState(false);

  // Fetch supported languages once on mount
  useEffect(() => {
    listLanguages()
      .then(setLangs)
      .catch(() => setLangs([{ code: "en", name: "English" }]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await listTranslations(search ? { search } : undefined));
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { void load(); }, [load]);

  const startEdit = (key: string, lang: string, currentValue: string | null) => {
    setEditing({ key, lang, value: currentValue ?? "" });
  };

  const cancelEdit = () => setEditing(null);

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await upsertTranslation(editing.key, { values: { [editing.lang]: editing.value } });
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteTranslationOverrides(deleteTarget.key);
    setDeleteTarget(null);
    await load();
  };

  const handleCreate = async () => {
    if (!newForm.key || Object.keys(newForm.values).length === 0) return;
    setCreating(true);
    try {
      await createTranslation({ key: newForm.key, values: newForm.values });
      setNewForm({ key: "", values: {} });
      setShowCreate(false);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const isEditing = (key: string, lang: string) =>
    editing?.key === key && editing?.lang === lang;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-main dark:text-white">Translations</h1>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-0.5">
            Manage UI translation keys across all {langs.length} languages. Click a value to edit.
          </p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Plus size={15} />
          Add Key
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-5 space-y-4">
          <h2 className="text-sm font-semibold text-text-main dark:text-white">New Translation Key</h2>
          <div>
            <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">
              Key (e.g. settings.language_label)
            </label>
            <input
              value={newForm.key}
              onChange={(e) => setNewForm((f) => ({ ...f, key: e.target.value }))}
              placeholder="e.g. home.welcome_message"
              className="w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm font-mono text-text-main dark:text-white outline-none focus:border-primary"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {langs.map((lang) => (
              <div key={lang.code}>
                <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">
                  {lang.name} ({lang.code.toUpperCase()})
                </label>
                <input
                  value={newForm.values[lang.code] ?? ""}
                  onChange={(e) =>
                    setNewForm((f) => ({
                      ...f,
                      values: e.target.value
                        ? { ...f.values, [lang.code]: e.target.value }
                        : Object.fromEntries(Object.entries(f.values).filter(([k]) => k !== lang.code)),
                    }))
                  }
                  placeholder={`${lang.code} value`}
                  className="w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-text-main dark:text-white outline-none focus:border-primary"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              disabled={creating || !newForm.key || Object.keys(newForm.values).length === 0}
              onClick={() => void handleCreate()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewForm({ key: "", values: {} }); }}
              className="rounded-lg border border-input-border dark:border-dark-border px-4 py-2 text-sm font-medium text-text-secondary dark:text-dark-text-secondary hover:bg-background-light dark:hover:bg-dark-bg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <SearchInput value={search} onChange={setSearch} placeholder="Search by key…" />

      {/* Table */}
      <div className="rounded-xl border border-input-border dark:border-dark-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-input-border dark:border-dark-border bg-background-light dark:bg-dark-bg">
                <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary dark:text-dark-text-secondary uppercase tracking-wide w-[24%]">
                  Key
                </th>
                {langs.map((lang) => (
                  <th
                    key={lang.code}
                    className="px-4 py-3 text-left text-xs font-medium text-text-secondary dark:text-dark-text-secondary uppercase tracking-wide"
                    title={lang.name}
                  >
                    {lang.code}
                  </th>
                ))}
                <th className="px-4 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-input-border dark:divide-dark-border">
              {loading ? (
                <tr>
                  <td
                    colSpan={langs.length + 2}
                    className="px-4 py-8 text-center text-sm text-text-secondary dark:text-dark-text-secondary"
                  >
                    Loading…
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={langs.length + 2}
                    className="px-4 py-8 text-center text-sm text-text-secondary dark:text-dark-text-secondary"
                  >
                    No translation keys found.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr
                    key={entry.key}
                    className="bg-white dark:bg-dark-surface hover:bg-background-light dark:hover:bg-dark-bg transition-colors"
                  >
                    {/* Key */}
                    <td className="px-4 py-2.5 align-top">
                      <span className="font-mono text-xs text-text-main dark:text-white break-all">
                        {entry.key}
                      </span>
                    </td>

                    {/* Value per language */}
                    {langs.map((lang) => {
                      const val = entry.values[lang.code] ?? null;
                      const isOverridden = entry.overridden_langs.includes(lang.code);

                      if (isEditing(entry.key, lang.code)) {
                        return (
                          <td key={lang.code} className="px-4 py-2 align-top">
                            <div className="flex items-start gap-1">
                              <textarea
                                autoFocus
                                value={editing!.value}
                                onChange={(e) =>
                                  setEditing((s) => s ? { ...s, value: e.target.value } : s)
                                }
                                rows={2}
                                className="flex-1 min-w-0 rounded border border-primary bg-white dark:bg-dark-bg px-2 py-1 text-xs text-text-main dark:text-white outline-none resize-none"
                              />
                              <div className="flex flex-col gap-0.5 shrink-0">
                                <button
                                  disabled={saving}
                                  onClick={() => void saveEdit()}
                                  className="p-1 rounded hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 dark:text-green-400"
                                >
                                  <Check size={13} />
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="p-1 rounded hover:bg-background-light dark:hover:bg-dark-bg text-text-secondary dark:text-dark-text-secondary"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={lang.code}
                          className="px-4 py-2.5 align-top cursor-pointer group"
                          onClick={() => startEdit(entry.key, lang.code, val)}
                          title={`Click to edit ${lang.name}`}
                        >
                          <div className="flex items-start gap-1.5 flex-wrap">
                            {val === null ? (
                              <span className="text-xs text-amber-500 dark:text-amber-400 italic">
                                missing
                              </span>
                            ) : (
                              <span className="text-xs text-text-main dark:text-white break-words max-w-[160px] group-hover:text-primary transition-colors">
                                {val}
                              </span>
                            )}
                            {isOverridden && (
                              <StatusBadge label="overridden" variant="info" />
                            )}
                          </div>
                        </td>
                      );
                    })}

                    {/* Revert action */}
                    <td className="px-3 py-2.5 align-top">
                      {entry.overridden_langs.length > 0 && (
                        <button
                          onClick={() => setDeleteTarget(entry)}
                          title="Revert all overrides to seed values"
                          className="p-1.5 rounded hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-500 transition-colors"
                        >
                          <RotateCcw size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Revert overrides?"
        description={`Remove all DB overrides for "${deleteTarget?.key}"? Values will revert to seed defaults.`}
        confirmLabel="Revert"
        destructive
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
