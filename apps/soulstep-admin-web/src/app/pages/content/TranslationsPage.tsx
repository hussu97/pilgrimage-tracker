import { useCallback, useEffect, useState } from "react";
import {
  createTranslation,
  deleteTranslationOverrides,
  listTranslations,
  upsertTranslation,
} from "@/lib/api/admin";
import type { TranslationEntry } from "@/lib/api/types";
import { SearchInput } from "@/components/shared/SearchInput";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Plus, RotateCcw, Check, X } from "lucide-react";

const LANGS = ["en", "ar", "hi"] as const;
type Lang = (typeof LANGS)[number];

interface EditState {
  key: string;
  lang: Lang;
  value: string;
}

interface NewKeyForm {
  key: string;
  en: string;
  ar: string;
  hi: string;
}

const EMPTY_FORM: NewKeyForm = { key: "", en: "", ar: "", hi: "" };

export function TranslationsPage() {
  const [entries, setEntries] = useState<TranslationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TranslationEntry | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newForm, setNewForm] = useState<NewKeyForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

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

  const startEdit = (key: string, lang: Lang, currentValue: string | null) => {
    setEditing({ key, lang, value: currentValue ?? "" });
  };

  const cancelEdit = () => setEditing(null);

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await upsertTranslation(editing.key, { [editing.lang]: editing.value });
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
    if (!newForm.key) return;
    setCreating(true);
    try {
      await createTranslation({
        key: newForm.key,
        ...(newForm.en ? { en: newForm.en } : {}),
        ...(newForm.ar ? { ar: newForm.ar } : {}),
        ...(newForm.hi ? { hi: newForm.hi } : {}),
      });
      setNewForm(EMPTY_FORM);
      setShowCreate(false);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const cellValue = (entry: TranslationEntry, lang: Lang): string | null =>
    entry[lang] ?? null;

  const isEditing = (key: string, lang: Lang) =>
    editing?.key === key && editing?.lang === lang;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-main dark:text-white">Translations</h1>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-0.5">
            Manage UI translation keys. DB overrides take precedence over seed values.
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">
                Key (e.g. home.title)
              </label>
              <input
                value={newForm.key}
                onChange={(e) => setNewForm((f) => ({ ...f, key: e.target.value }))}
                placeholder="e.g. settings.language_label"
                className="w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm font-mono text-text-main dark:text-white outline-none focus:border-primary"
              />
            </div>
            {LANGS.map((lang) => (
              <div key={lang}>
                <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1 uppercase">
                  {lang}
                </label>
                <input
                  value={newForm[lang]}
                  onChange={(e) => setNewForm((f) => ({ ...f, [lang]: e.target.value }))}
                  placeholder={`${lang} value`}
                  className="w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-text-main dark:text-white outline-none focus:border-primary"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              disabled={creating || !newForm.key}
              onClick={() => void handleCreate()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewForm(EMPTY_FORM); }}
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
                <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary dark:text-dark-text-secondary uppercase tracking-wide w-[28%]">
                  Key
                </th>
                {LANGS.map((lang) => (
                  <th
                    key={lang}
                    className="px-4 py-3 text-left text-xs font-medium text-text-secondary dark:text-dark-text-secondary uppercase tracking-wide"
                  >
                    {lang}
                  </th>
                ))}
                <th className="px-4 py-3 w-14" />
              </tr>
            </thead>
            <tbody className="divide-y divide-input-border dark:divide-dark-border">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-text-secondary dark:text-dark-text-secondary"
                  >
                    Loading…
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
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

                    {/* Values per lang */}
                    {LANGS.map((lang) => {
                      const val = cellValue(entry, lang);
                      const isOverridden = entry.overridden_langs.includes(lang);

                      if (isEditing(entry.key, lang)) {
                        return (
                          <td key={lang} className="px-4 py-2 align-top">
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
                          key={lang}
                          className="px-4 py-2.5 align-top cursor-pointer group"
                          onClick={() => startEdit(entry.key, lang, val)}
                          title="Click to edit"
                        >
                          <div className="flex items-start gap-1.5 flex-wrap">
                            {val === null ? (
                              <span className="text-xs text-amber-500 dark:text-amber-400 italic">
                                missing
                              </span>
                            ) : (
                              <span className="text-xs text-text-main dark:text-white break-words max-w-[180px] group-hover:text-primary transition-colors">
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

                    {/* Actions */}
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
