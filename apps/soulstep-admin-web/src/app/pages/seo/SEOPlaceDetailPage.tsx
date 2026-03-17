import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSEODetail, patchSEO, regenerateSEO, listLanguages } from "@/lib/api/admin";
import type { SEODetail, FAQItem, PatchSEOBody, Language } from "@/lib/api/types";
import { SERPPreview } from "@/components/seo/SERPPreview";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, RefreshCw, Save, Plus, Trash2, PenLine, Clock } from "lucide-react";

const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL ?? "https://soul-step.org";

const inputCls =
  "w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg text-text-main dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="p-4">
      <p className="text-sm font-medium text-text-main dark:text-white mb-0.5">{label}</p>
      {hint && <p className="text-xs text-text-secondary dark:text-dark-text-secondary mb-2">{hint}</p>}
      {children}
    </div>
  );
}

const ALL_LANGS = ["en", "ar", "hi", "te", "ml"];
const LANG_NAMES: Record<string, string> = { en: "English", ar: "Arabic", hi: "Hindi", te: "Telugu", ml: "Malayalam" };

export function SEOPlaceDetailPage() {
  const { placeCode } = useParams<{ placeCode: string }>();
  const navigate = useNavigate();

  const [seo, setSEO] = useState<SEODetail | null>(null);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [activeTab, setActiveTab] = useState("en");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(["en"]);

  // Edit state (English only)
  const [editSlug, setEditSlug] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editRich, setEditRich] = useState("");
  const [editFaqs, setEditFaqs] = useState<FAQItem[]>([]);
  const [editOgImage, setEditOgImage] = useState("");

  useEffect(() => {
    if (!placeCode) return;
    void (async () => {
      setLoading(true);
      try {
        const [data, langs] = await Promise.all([getSEODetail(placeCode), listLanguages()]);
        setSEO(data);
        setLanguages(langs);
        resetEditState(data);
      } finally {
        setLoading(false);
      }
    })();
  }, [placeCode]);

  function resetEditState(data: SEODetail) {
    setEditSlug(data.slug ?? "");
    setEditTitle(data.seo_title ?? "");
    setEditDesc(data.meta_description ?? "");
    setEditRich(data.rich_description ?? "");
    setEditFaqs(data.faq_json ?? []);
    setEditOgImage(data.og_image_url ?? "");
  }

  const toggleLang = (lang: string) => {
    setSelectedLangs((prev) => {
      if (prev.includes(lang)) {
        const next = prev.filter((l) => l !== lang);
        return next.length === 0 ? ["en"] : next;
      }
      return [...prev, lang];
    });
  };

  const handleSave = async () => {
    if (!placeCode) return;
    setSaving(true);
    try {
      const body: PatchSEOBody = {
        slug: editSlug || undefined,
        seo_title: editTitle || undefined,
        meta_description: editDesc || undefined,
        rich_description: editRich || undefined,
        faq_json: editFaqs.length > 0 ? editFaqs : undefined,
        og_image_url: editOgImage || undefined,
        is_manually_edited: true,
      };
      const updated = await patchSEO(placeCode, body);
      setSEO(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async (force = false) => {
    if (!placeCode) return;
    if (
      seo?.is_manually_edited &&
      !force &&
      !window.confirm("This place has manually edited SEO. Regenerate anyway? This will overwrite your edits.")
    ) return;
    setRegenerating(true);
    try {
      const updated = await regenerateSEO(placeCode, force || seo?.is_manually_edited === true, selectedLangs);
      setSEO(updated);
      resetEditState(updated);
      setEditing(false);
    } finally {
      setRegenerating(false);
    }
  };

  const addFaq = () => setEditFaqs((prev) => [...prev, { question: "", answer: "" }]);
  const removeFaq = (i: number) => setEditFaqs((prev) => prev.filter((_, idx) => idx !== i));
  const updateFaq = (i: number, field: "question" | "answer", value: string) =>
    setEditFaqs((prev) => prev.map((faq, idx) => (idx === i ? { ...faq, [field]: value } : faq)));

  const previewUrl = seo?.slug
    ? `${FRONTEND_URL}/places/${placeCode}/${seo.slug}`
    : `${FRONTEND_URL}/places/${placeCode}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-text-secondary dark:text-dark-text-secondary">
        Loading…
      </div>
    );
  }

  if (!seo) {
    return (
      <div className="text-center py-12 text-text-secondary dark:text-dark-text-secondary">
        Place not found.
      </div>
    );
  }

  const isEnglish = activeTab === "en";
  const langTranslation = seo.translations?.[activeTab];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/seo")}
            className="flex items-center gap-1.5 text-text-secondary dark:text-dark-text-secondary hover:text-text-main dark:hover:text-white text-sm"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <div>
            <h1 className="text-lg font-semibold text-text-main dark:text-white">{seo.name}</h1>
            <p className="text-xs text-text-secondary dark:text-dark-text-secondary">
              {seo.religion} · {seo.place_type} · {seo.address}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {seo.is_manually_edited && (
            <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 text-xs font-medium px-2 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <PenLine size={11} /> Manually edited
            </span>
          )}
          <button
            onClick={() => handleRegenerate()}
            disabled={regenerating}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-input-border dark:border-dark-border rounded-lg hover:bg-background-light dark:hover:bg-dark-bg text-text-main dark:text-white disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={13} className={regenerating ? "animate-spin" : ""} />
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
          {isEnglish && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              Edit SEO
            </button>
          )}
          {isEnglish && editing && (
            <>
              <button
                onClick={() => { setEditing(false); seo && resetEditState(seo); }}
                className="text-sm px-3 py-1.5 border border-input-border dark:border-dark-border rounded-lg hover:bg-background-light dark:hover:bg-dark-bg text-text-main dark:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <Save size={13} />
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Language selector for regeneration */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-text-secondary dark:text-dark-text-secondary">Regenerate for:</span>
        {ALL_LANGS.map((lang) => (
          <button
            key={lang}
            onClick={() => toggleLang(lang)}
            disabled={regenerating}
            className={[
              "px-2 py-0.5 text-xs rounded-full border transition-colors",
              selectedLangs.includes(lang)
                ? "bg-primary text-white border-primary"
                : "border-input-border dark:border-dark-border text-text-secondary dark:text-dark-text-secondary hover:border-primary hover:text-primary",
            ].join(" ")}
          >
            {LANG_NAMES[lang]}
          </button>
        ))}
      </div>

      {/* Language tabs */}
      {languages.length > 0 && (
        <div className="border-b border-input-border dark:border-dark-border">
          <nav className="flex gap-1 overflow-x-auto">
            {languages.map((lang) => {
              const hasTranslation = lang.code === "en" || !!seo.translations?.[lang.code];
              return (
                <button
                  key={lang.code}
                  onClick={() => { setActiveTab(lang.code); setEditing(false); }}
                  className={[
                    "px-4 py-2.5 text-sm whitespace-nowrap transition-colors",
                    activeTab === lang.code
                      ? "border-b-2 border-primary text-primary dark:text-primary font-medium"
                      : "border-b-2 border-transparent text-text-secondary dark:text-dark-text-secondary hover:text-text-main dark:hover:text-white",
                  ].join(" ")}
                >
                  {lang.name}
                  {!hasTranslation && (
                    <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-400 align-middle" title="No translations yet" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {/* SERP Preview — English only */}
      {isEnglish && (
        <div className="bg-white dark:bg-dark-surface rounded-lg border border-input-border dark:border-dark-border p-4">
          <h2 className="text-sm font-medium text-text-main dark:text-white mb-3">Google SERP Preview</h2>
          <SERPPreview
            title={editing ? editTitle : seo.seo_title ?? ""}
            description={editing ? editDesc : seo.meta_description ?? ""}
            url={previewUrl}
          />
        </div>
      )}

      {/* Content panel */}
      {isEnglish ? (
        /* ── English tab: full edit form ── */
        <div className="bg-white dark:bg-dark-surface rounded-lg border border-input-border dark:border-dark-border divide-y divide-input-border dark:divide-dark-border">
          <Field label="Slug" hint="URL-friendly identifier. Changing this updates the place URL.">
            {editing ? (
              <input value={editSlug} onChange={(e) => setEditSlug(e.target.value)} className={inputCls} placeholder="e.g. grand-mosque-dubai" />
            ) : (
              <code className="text-sm text-text-main dark:text-white bg-background-light dark:bg-dark-bg px-2 py-1 rounded">{seo.slug ?? "—"}</code>
            )}
          </Field>

          <Field label="SEO Title" hint="Shown in browser tabs and search results (≤60 chars recommended).">
            {editing ? (
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={inputCls} placeholder="e.g. Grand Mosque – Islamic Site in Dubai" />
            ) : (
              <p className="text-sm text-text-main dark:text-white">{seo.seo_title ?? "—"}</p>
            )}
          </Field>

          <Field label="Meta Description" hint="Shown under the title in search results (≤160 chars recommended).">
            {editing ? (
              <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} className={inputCls} placeholder="e.g. Explore Grand Mosque in Dubai…" />
            ) : (
              <p className="text-sm text-text-main dark:text-white">{seo.meta_description ?? "—"}</p>
            )}
          </Field>

          <Field label="Rich Description" hint="Longer paragraph for AI citation and crawler indexing.">
            {editing ? (
              <textarea value={editRich} onChange={(e) => setEditRich(e.target.value)} rows={4} className={inputCls} />
            ) : (
              <p className="text-sm text-text-main dark:text-white">{seo.rich_description ?? "—"}</p>
            )}
          </Field>

          <Field label="OG Image URL" hint="1200×630px image for social sharing previews.">
            {editing ? (
              <input value={editOgImage} onChange={(e) => setEditOgImage(e.target.value)} className={inputCls} placeholder="https://cdn.example.com/image.jpg" />
            ) : (
              <p className="text-sm text-text-main dark:text-white break-all">{seo.og_image_url ?? "—"}</p>
            )}
          </Field>

          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-text-main dark:text-white">FAQs</p>
                <p className="text-xs text-text-secondary dark:text-dark-text-secondary mt-0.5">
                  Rendered as FAQPage schema for rich snippets and AI citation.
                </p>
              </div>
              {editing && (
                <button onClick={addFaq} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-input-border dark:border-dark-border rounded-lg hover:bg-background-light dark:hover:bg-dark-bg text-text-main dark:text-white">
                  <Plus size={12} /> Add FAQ
                </button>
              )}
            </div>
            {(editing ? editFaqs : seo.faq_json ?? []).length === 0 ? (
              <p className="text-sm text-text-secondary dark:text-dark-text-secondary">No FAQs yet.</p>
            ) : editing ? (
              <div className="space-y-3">
                {editFaqs.map((faq, i) => (
                  <div key={i} className="border border-input-border dark:border-dark-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <input value={faq.question} onChange={(e) => updateFaq(i, "question", e.target.value)} className={inputCls} placeholder="Question" />
                      <button onClick={() => removeFaq(i)} className="text-red-500 hover:text-red-600 shrink-0"><Trash2 size={14} /></button>
                    </div>
                    <textarea value={faq.answer} onChange={(e) => updateFaq(i, "answer", e.target.value)} rows={2} className={inputCls} placeholder="Answer" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {(seo.faq_json ?? []).map((faq, i) => (
                  <div key={i} className="border border-input-border dark:border-dark-border rounded-lg p-3">
                    <p className="text-sm font-medium text-text-main dark:text-white">{faq.question}</p>
                    <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-1">{faq.answer}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Non-English tab: PlaceSEOTranslation data ── */
        <div className="space-y-4">
          {!langTranslation ? (
            <div className="bg-white dark:bg-dark-surface rounded-lg border border-input-border dark:border-dark-border p-6 text-center space-y-3">
              <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
                No translations yet for <strong>{LANG_NAMES[activeTab] ?? activeTab}</strong>.
              </p>
              <button
                onClick={() => {
                  setSelectedLangs([activeTab]);
                  void handleRegenerate(seo.is_manually_edited);
                }}
                disabled={regenerating || !seo.seo_title}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <RefreshCw size={13} className={regenerating ? "animate-spin" : ""} />
                Generate translations now
              </button>
              {!seo.seo_title && (
                <p className="text-xs text-text-secondary dark:text-dark-text-secondary">
                  Generate English SEO first before translating.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Meta info */}
              <div className="flex items-center gap-3 text-xs text-text-secondary dark:text-dark-text-secondary">
                <span className="flex items-center gap-1">
                  <Clock size={12} /> Template v{langTranslation.template_version}
                </span>
                {langTranslation.is_manually_edited && (
                  <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                    <PenLine size={11} /> Manually edited
                  </span>
                )}
                {langTranslation.generated_at && (
                  <span>Generated: {formatDate(langTranslation.generated_at)}</span>
                )}
              </div>

              <div
                className="bg-white dark:bg-dark-surface rounded-lg border border-input-border dark:border-dark-border divide-y divide-input-border dark:divide-dark-border"
                dir={activeTab === "ar" ? "rtl" : "ltr"}
              >
                <Field label="SEO Title">
                  <p className="text-sm text-text-main dark:text-white">{langTranslation.seo_title ?? "—"}</p>
                </Field>
                <Field label="Meta Description">
                  <p className="text-sm text-text-main dark:text-white">{langTranslation.meta_description ?? "—"}</p>
                </Field>
                <Field label="Rich Description">
                  <p className="text-sm text-text-main dark:text-white whitespace-pre-wrap">{langTranslation.rich_description ?? "—"}</p>
                </Field>

                {/* FAQs */}
                {langTranslation.faq_json && langTranslation.faq_json.length > 0 && (
                  <div className="p-4">
                    <p className="text-sm font-medium text-text-main dark:text-white mb-3">FAQs</p>
                    <div className="space-y-3">
                      {langTranslation.faq_json.map((faq, i) => (
                        <div key={i} className="border border-input-border dark:border-dark-border rounded-lg p-3">
                          <p className="text-sm font-medium text-text-main dark:text-white">{faq.question}</p>
                          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-1">{faq.answer}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Metadata */}
      <div className="text-xs text-text-secondary dark:text-dark-text-secondary space-y-0.5">
        {seo.template_version != null && <p>Template version: {seo.template_version}</p>}
        {seo.generated_at && <p>Generated: {formatDate(seo.generated_at)}</p>}
        {seo.updated_at && <p>Last updated: {formatDate(seo.updated_at)}</p>}
      </div>
    </div>
  );
}
