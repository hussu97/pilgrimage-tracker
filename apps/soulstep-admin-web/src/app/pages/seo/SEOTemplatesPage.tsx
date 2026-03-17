import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { listSEOTemplates, patchSEOTemplate, listSEOLabels, patchSEOLabel } from "@/lib/api/admin";
import type { SEOTemplate, SEOLabelEntry } from "@/lib/api/types";
import { ArrowLeft, Save, Edit2, X } from "lucide-react";

const LANG_NAMES: Record<string, string> = { en: "English", ar: "Arabic", hi: "Hindi", te: "Telugu", ml: "Malayalam" };
const LANGS = ["en", "ar", "hi", "te", "ml"];

const inputCls =
  "w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg text-text-main dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40";

export function SEOTemplatesPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<SEOTemplate[]>([]);
  const [labels, setLabels] = useState<SEOLabelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"templates" | "labels">("templates");
  const [activeLang, setActiveLang] = useState("en");

  // Edit state for templates
  const [editingKey, setEditingKey] = useState<string | null>(null); // "code|lang"
  const [editText, setEditText] = useState("");
  const [editFallback, setEditFallback] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit state for labels
  const [editingLabelKey, setEditingLabelKey] = useState<string | null>(null);
  const [editLabelText, setEditLabelText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tmplRes, labelRes] = await Promise.all([listSEOTemplates(), listSEOLabels()]);
      setTemplates(tmplRes);
      setLabels(labelRes);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Group templates by template_code
  const templateCodes = [...new Set(templates.map((t) => t.template_code))];
  const filteredTemplates = templates.filter((t) => t.lang === activeLang);

  // Group labels by type
  const filteredLabels = labels.filter((l) => l.lang === activeLang);
  const religionLabels = filteredLabels.filter((l) => l.label_type === "religion");
  const placeTypeLabels = filteredLabels.filter((l) => l.label_type === "place_type");

  const startEditTemplate = (t: SEOTemplate) => {
    setEditingKey(`${t.template_code}|${t.lang}`);
    setEditText(t.template_text);
    setEditFallback(t.fallback_text ?? "");
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditText("");
    setEditFallback("");
  };

  const saveTemplate = async (t: SEOTemplate) => {
    setSaving(true);
    try {
      const updated = await patchSEOTemplate(t.template_code, t.lang, {
        template_text: editText,
        fallback_text: editFallback || undefined,
      });
      setTemplates((prev) =>
        prev.map((old) =>
          old.template_code === t.template_code && old.lang === t.lang ? updated : old
        )
      );
      setEditingKey(null);
    } finally {
      setSaving(false);
    }
  };

  const startEditLabel = (l: SEOLabelEntry) => {
    setEditingLabelKey(`${l.label_type}|${l.label_key}|${l.lang}`);
    setEditLabelText(l.label_text);
  };

  const saveLabel = async (l: SEOLabelEntry) => {
    setSaving(true);
    try {
      const updated = await patchSEOLabel(l.label_type, l.label_key, l.lang, editLabelText);
      setLabels((prev) =>
        prev.map((old) =>
          old.label_type === l.label_type && old.label_key === l.label_key && old.lang === l.lang ? updated : old
        )
      );
      setEditingLabelKey(null);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-text-secondary dark:text-dark-text-secondary">
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/seo")}
          className="flex items-center gap-1.5 text-text-secondary dark:text-dark-text-secondary hover:text-text-main dark:hover:text-white text-sm"
        >
          <ArrowLeft size={16} /> Back to SEO
        </button>
        <div>
          <h1 className="text-xl font-semibold text-text-main dark:text-white">SEO Templates & Labels</h1>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-0.5">
            Edit template patterns and translated labels used for SEO generation.
          </p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-input-border dark:border-dark-border">
        <button
          onClick={() => setActiveTab("templates")}
          className={[
            "px-4 py-2.5 text-sm",
            activeTab === "templates"
              ? "border-b-2 border-primary text-primary font-medium"
              : "border-b-2 border-transparent text-text-secondary dark:text-dark-text-secondary hover:text-text-main dark:hover:text-white",
          ].join(" ")}
        >
          Templates ({templates.length})
        </button>
        <button
          onClick={() => setActiveTab("labels")}
          className={[
            "px-4 py-2.5 text-sm",
            activeTab === "labels"
              ? "border-b-2 border-primary text-primary font-medium"
              : "border-b-2 border-transparent text-text-secondary dark:text-dark-text-secondary hover:text-text-main dark:hover:text-white",
          ].join(" ")}
        >
          Labels ({labels.length})
        </button>
      </div>

      {/* Language pills */}
      <div className="flex gap-2">
        {LANGS.map((lang) => (
          <button
            key={lang}
            onClick={() => { setActiveLang(lang); cancelEdit(); setEditingLabelKey(null); }}
            className={[
              "px-3 py-1 text-sm rounded-full border transition-colors",
              activeLang === lang
                ? "bg-primary text-white border-primary"
                : "border-input-border dark:border-dark-border text-text-secondary dark:text-dark-text-secondary hover:border-primary hover:text-primary",
            ].join(" ")}
          >
            {LANG_NAMES[lang]}
          </button>
        ))}
      </div>

      {activeTab === "templates" ? (
        /* ── Templates ── */
        <div className="space-y-4">
          {templateCodes.map((code) => {
            const tmpl = filteredTemplates.find((t) => t.template_code === code);
            if (!tmpl) return null;
            const isEditing = editingKey === `${code}|${activeLang}`;

            return (
              <div
                key={code}
                className="bg-white dark:bg-dark-surface rounded-lg border border-input-border dark:border-dark-border p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-background-light dark:bg-dark-bg px-1.5 py-0.5 rounded text-text-main dark:text-white font-mono">
                      {code}
                    </code>
                    <span className="text-xs text-text-secondary dark:text-dark-text-secondary">
                      v{tmpl.version}
                    </span>
                    {!tmpl.is_active && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400">
                        Inactive
                      </span>
                    )}
                  </div>
                  {isEditing ? (
                    <div className="flex gap-1.5">
                      <button onClick={cancelEdit} className="text-text-secondary hover:text-text-main dark:hover:text-white"><X size={14} /></button>
                      <button
                        onClick={() => saveTemplate(tmpl)}
                        disabled={saving}
                        className="flex items-center gap-1 text-xs px-2 py-1 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
                      >
                        <Save size={12} /> {saving ? "…" : "Save"}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => startEditTemplate(tmpl)} className="text-text-secondary hover:text-primary">
                      <Edit2 size={14} />
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-text-secondary dark:text-dark-text-secondary">Template text</label>
                      <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary dark:text-dark-text-secondary">Fallback text</label>
                      <textarea value={editFallback} onChange={(e) => setEditFallback(e.target.value)} rows={2} className={inputCls} />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm text-text-main dark:text-white" dir={activeLang === "ar" ? "rtl" : "ltr"}>
                      {tmpl.template_text}
                    </p>
                    {tmpl.fallback_text && (
                      <p className="text-xs text-text-secondary dark:text-dark-text-secondary" dir={activeLang === "ar" ? "rtl" : "ltr"}>
                        Fallback: {tmpl.fallback_text}
                      </p>
                    )}
                    {Object.keys(tmpl.static_phrases).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(tmpl.static_phrases).map(([k, v]) => (
                          <span key={k} className="text-xs bg-background-light dark:bg-dark-bg px-1.5 py-0.5 rounded">
                            {k}: {typeof v === "string" && v.length > 30 ? v.slice(0, 30) + "…" : v}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filteredTemplates.length === 0 && (
            <p className="text-sm text-text-secondary dark:text-dark-text-secondary text-center py-8">
              No templates for {LANG_NAMES[activeLang]}.
            </p>
          )}
        </div>
      ) : (
        /* ── Labels ── */
        <div className="space-y-6">
          {/* Religion labels */}
          <div>
            <h3 className="text-sm font-medium text-text-main dark:text-white mb-3">Religion Labels</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {religionLabels.map((l) => {
                const key = `${l.label_type}|${l.label_key}|${l.lang}`;
                const isEditing = editingLabelKey === key;
                return (
                  <div
                    key={key}
                    className="bg-white dark:bg-dark-surface rounded-lg border border-input-border dark:border-dark-border p-3 flex items-center justify-between gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-text-secondary dark:text-dark-text-secondary">{l.label_key}</div>
                      {isEditing ? (
                        <input
                          value={editLabelText}
                          onChange={(e) => setEditLabelText(e.target.value)}
                          className={inputCls + " mt-1"}
                          dir={activeLang === "ar" ? "rtl" : "ltr"}
                        />
                      ) : (
                        <div className="text-sm text-text-main dark:text-white" dir={activeLang === "ar" ? "rtl" : "ltr"}>
                          {l.label_text}
                        </div>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => setEditingLabelKey(null)} className="text-text-secondary hover:text-text-main"><X size={14} /></button>
                        <button
                          onClick={() => saveLabel(l)}
                          disabled={saving}
                          className="text-primary hover:text-primary/80 disabled:opacity-50"
                        >
                          <Save size={14} />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => startEditLabel(l)} className="text-text-secondary hover:text-primary shrink-0">
                        <Edit2 size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Place type labels */}
          <div>
            <h3 className="text-sm font-medium text-text-main dark:text-white mb-3">Place Type Labels</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {placeTypeLabels.map((l) => {
                const key = `${l.label_type}|${l.label_key}|${l.lang}`;
                const isEditing = editingLabelKey === key;
                return (
                  <div
                    key={key}
                    className="bg-white dark:bg-dark-surface rounded-lg border border-input-border dark:border-dark-border p-3 flex items-center justify-between gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-text-secondary dark:text-dark-text-secondary">{l.label_key}</div>
                      {isEditing ? (
                        <input
                          value={editLabelText}
                          onChange={(e) => setEditLabelText(e.target.value)}
                          className={inputCls + " mt-1"}
                          dir={activeLang === "ar" ? "rtl" : "ltr"}
                        />
                      ) : (
                        <div className="text-sm text-text-main dark:text-white" dir={activeLang === "ar" ? "rtl" : "ltr"}>
                          {l.label_text}
                        </div>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => setEditingLabelKey(null)} className="text-text-secondary hover:text-text-main"><X size={14} /></button>
                        <button
                          onClick={() => saveLabel(l)}
                          disabled={saving}
                          className="text-primary hover:text-primary/80 disabled:opacity-50"
                        >
                          <Save size={14} />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => startEditLabel(l)} className="text-text-secondary hover:text-primary shrink-0">
                        <Edit2 size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {filteredLabels.length === 0 && (
            <p className="text-sm text-text-secondary dark:text-dark-text-secondary text-center py-8">
              No labels for {LANG_NAMES[activeLang]}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
