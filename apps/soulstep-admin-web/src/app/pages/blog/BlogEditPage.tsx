import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Plus, Trash2, ChevronDown, ChevronUp, Link2, Eye, EyeOff, Loader2, X,
} from "lucide-react";
import {
  createBlogPost, fetchLinkPreview, getAdminBlogPost, updateBlogPost,
} from "@/lib/api/blog";
import type { ArticleSection, BlogFAQItem, LinkPreviewResult } from "@/lib/api/types";

// ── URL extraction ─────────────────────────────────────────────────────────────

const URL_RE = /https?:\/\/[^\s"'<>()]+/g;

function extractAllUrls(sections: ArticleSection[]): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const s of sections) {
    for (const p of s.paragraphs) {
      for (const m of p.matchAll(new RegExp(URL_RE.source, "g"))) {
        if (!seen.has(m[0])) { seen.add(m[0]); urls.push(m[0]); }
      }
    }
  }
  return urls;
}

// ── Gradient options ───────────────────────────────────────────────────────────

const GRADIENTS = [
  { label: "Emerald → Teal", value: "from-emerald-500 to-teal-600" },
  { label: "Blue → Indigo", value: "from-blue-500 to-indigo-600" },
  { label: "Purple → Pink", value: "from-purple-500 to-pink-500" },
  { label: "Amber → Orange", value: "from-amber-500 to-orange-600" },
  { label: "Rose → Red", value: "from-rose-500 to-red-600" },
  { label: "Cyan → Blue", value: "from-cyan-500 to-blue-600" },
  { label: "Green → Lime", value: "from-green-500 to-lime-400" },
  { label: "Slate → Gray", value: "from-slate-500 to-gray-700" },
];

const CATEGORIES = [
  "Islam", "Hinduism", "Christianity", "Buddhism", "Sikhism",
  "Travel Guide", "Spirituality", "History",
];

// ── Link preview card ─────────────────────────────────────────────────────────

function LinkPreviewCard({
  preview,
  onDismiss,
}: {
  preview: LinkPreviewResult;
  onDismiss: () => void;
}) {
  return (
    <div className="relative flex gap-3 rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-3 shadow-sm">
      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-2 right-2 text-text-secondary dark:text-dark-text-secondary hover:text-text-main dark:hover:text-white"
      >
        <X size={14} />
      </button>
      {preview.image && (
        <img
          src={preview.image}
          alt=""
          className="w-20 h-16 object-cover rounded-lg flex-shrink-0 bg-slate-100 dark:bg-dark-border"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}
      <div className="min-w-0 flex-1 pr-4">
        <p className="text-xs font-medium text-text-secondary dark:text-dark-text-secondary uppercase tracking-wide truncate">
          {preview.site_name || new URL(preview.url).hostname}
        </p>
        <p className="text-sm font-semibold text-text-main dark:text-white line-clamp-1 mt-0.5">
          {preview.title || preview.url}
        </p>
        {preview.description && (
          <p className="text-xs text-text-secondary dark:text-dark-text-secondary line-clamp-2 mt-0.5">
            {preview.description}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Section editor ─────────────────────────────────────────────────────────────

function SectionEditor({
  section,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  section: ArticleSection;
  index: number;
  total: number;
  onChange: (s: ArticleSection) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary dark:text-dark-text-secondary">
          Section {index + 1}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={index === 0}
            onClick={onMoveUp}
            className="p-1 rounded text-text-secondary disabled:opacity-30 hover:text-text-main dark:text-dark-text-secondary dark:hover:text-white transition-colors"
          >
            <ChevronUp size={15} />
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={onMoveDown}
            className="p-1 rounded text-text-secondary disabled:opacity-30 hover:text-text-main dark:text-dark-text-secondary dark:hover:text-white transition-colors"
          >
            <ChevronDown size={15} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <input
        type="text"
        placeholder="Section heading (optional)"
        value={section.heading ?? ""}
        onChange={(e) => onChange({ ...section, heading: e.target.value || undefined })}
        className="w-full px-3 py-2 rounded-lg border border-input-border dark:border-dark-border bg-background-light dark:bg-dark-bg text-sm text-text-main dark:text-white placeholder-text-secondary dark:placeholder-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
      />

      {section.paragraphs.map((para, pi) => (
        <div key={pi} className="flex gap-2">
          <textarea
            rows={3}
            placeholder={`Paragraph ${pi + 1}`}
            value={para}
            onChange={(e) => {
              const newParas = [...section.paragraphs];
              newParas[pi] = e.target.value;
              onChange({ ...section, paragraphs: newParas });
            }}
            className="flex-1 px-3 py-2 rounded-lg border border-input-border dark:border-dark-border bg-background-light dark:bg-dark-bg text-sm text-text-main dark:text-white placeholder-text-secondary dark:placeholder-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
          />
          <button
            type="button"
            onClick={() => {
              const newParas = section.paragraphs.filter((_, i) => i !== pi);
              onChange({ ...section, paragraphs: newParas.length ? newParas : [""] });
            }}
            className="self-start mt-1 p-1.5 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange({ ...section, paragraphs: [...section.paragraphs, ""] })}
        className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
      >
        <Plus size={13} /> Add paragraph
      </button>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function BlogEditPage() {
  const { postCode } = useParams<{ postCode?: string }>();
  const navigate = useNavigate();
  const isCreate = postCode === undefined;

  // Form state
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [readingTime, setReadingTime] = useState(5);
  const [coverGradient, setCoverGradient] = useState(GRADIENTS[0].value);
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [sections, setSections] = useState<ArticleSection[]>([{ paragraphs: [""] }]);
  const [faqItems, setFaqItems] = useState<BlogFAQItem[]>([]);
  const [isPublished, setIsPublished] = useState(true);

  // UI state
  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkPreviews, setLinkPreviews] = useState<LinkPreviewResult[]>([]);
  const [fetchingPreviews, setFetchingPreviews] = useState(false);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const slugManualRef = useRef(false);

  // Load existing post
  useEffect(() => {
    if (!postCode) return;
    setLoading(true);
    getAdminBlogPost(postCode)
      .then((post) => {
        setSlug(post.slug);
        setTitle(post.title);
        setDescription(post.description);
        setCategory(post.category);
        setReadingTime(post.reading_time);
        setCoverGradient(post.cover_gradient);
        setCoverImageUrl(post.cover_image_url ?? "");
        setAuthorName(post.author_name ?? "");
        setTagsInput((post.tags ?? []).join(", "));
        setSections(post.content.length ? post.content : [{ paragraphs: [""] }]);
        setFaqItems(post.faq_json ?? []);
        setIsPublished(post.is_published);
        slugManualRef.current = true;
      })
      .catch(() => setError("Failed to load post"))
      .finally(() => setLoading(false));
  }, [postCode]);

  // Auto-generate slug from title
  useEffect(() => {
    if (!slugManualRef.current && title) {
      setSlug(
        title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-")
          .slice(0, 80)
      );
    }
  }, [title]);

  // Auto-detect URLs and fetch previews
  const fetchPreviews = useCallback(async (secs: ArticleSection[]) => {
    const urls = extractAllUrls(secs).filter((u) => !previewUrlsRef.current.has(u));
    if (!urls.length) return;
    setFetchingPreviews(true);
    for (const url of urls) {
      try {
        const preview = await fetchLinkPreview(url);
        previewUrlsRef.current.add(url);
        setLinkPreviews((prev) => {
          if (prev.find((p) => p.url === url)) return prev;
          return [...prev, preview];
        });
      } catch {
        previewUrlsRef.current.add(url); // don't retry
      }
    }
    setFetchingPreviews(false);
  }, []);

  // Debounce preview fetch when content changes
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSectionsChange = (newSections: ArticleSection[]) => {
    setSections(newSections);
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    previewDebounceRef.current = setTimeout(() => void fetchPreviews(newSections), 1200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const payload = {
        slug,
        title,
        description,
        category,
        reading_time: readingTime,
        cover_gradient: coverGradient,
        cover_image_url: coverImageUrl || undefined,
        author_name: authorName || undefined,
        tags,
        content: sections.filter((s) => s.paragraphs.some((p) => p.trim())),
        faq_json: faqItems.length ? faqItems : undefined,
        is_published: isPublished,
      };
      if (isCreate) {
        await createBlogPost(payload);
      } else {
        await updateBlogPost(postCode!, payload);
      }
      navigate("/blog");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Failed to save post. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-main dark:text-white">
            {isCreate ? "New Blog Post" : "Edit Blog Post"}
          </h1>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-0.5">
            {isCreate ? "Create a new editorial blog article" : `Editing: ${title}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsPublished((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              isPublished
                ? "border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20"
                : "border-input-border dark:border-dark-border text-text-secondary dark:text-dark-text-secondary"
            }`}
          >
            {isPublished ? <Eye size={15} /> : <EyeOff size={15} />}
            {isPublished ? "Published" : "Draft"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/blog")}
            className="px-4 py-2 rounded-lg border border-input-border dark:border-dark-border text-sm font-medium text-text-secondary dark:text-dark-text-secondary hover:text-text-main dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            {saving ? "Saving…" : isCreate ? "Publish" : "Save changes"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Cover preview strip */}
      <div className={`h-24 rounded-2xl bg-gradient-to-br ${coverGradient} flex items-center justify-center`}>
        <span className="text-white/80 text-sm font-medium">Cover preview</span>
      </div>

      {/* Core metadata */}
      <div className="rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-5 space-y-4">
        <h2 className="text-sm font-semibold text-text-main dark:text-white">Post details</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">
              Title *
            </label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input-border dark:border-dark-border bg-background-light dark:bg-dark-bg text-sm text-text-main dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Article title"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">
              Slug *
            </label>
            <input
              required
              value={slug}
              onChange={(e) => { setSlug(e.target.value); slugManualRef.current = true; }}
              className="w-full px-3 py-2 rounded-lg border border-input-border dark:border-dark-border bg-background-light dark:bg-dark-bg text-sm text-text-main dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="article-url-slug"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">
            Description / Excerpt *
          </label>
          <textarea
            required
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-input-border dark:border-dark-border bg-background-light dark:bg-dark-bg text-sm text-text-main dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Brief summary shown on the listing page"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">
              Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input-border dark:border-dark-border bg-background-light dark:bg-dark-bg text-sm text-text-main dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">
              Reading time (min)
            </label>
            <input
              type="number"
              min={1}
              max={60}
              value={readingTime}
              onChange={(e) => setReadingTime(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-input-border dark:border-dark-border bg-background-light dark:bg-dark-bg text-sm text-text-main dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">
              Author name
            </label>
            <input
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input-border dark:border-dark-border bg-background-light dark:bg-dark-bg text-sm text-text-main dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="e.g. Hussain Abbasi"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">
            Tags (comma separated)
          </label>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-input-border dark:border-dark-border bg-background-light dark:bg-dark-bg text-sm text-text-main dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="pilgrimage, umrah, travel guide"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">
              Cover gradient
            </label>
            <select
              value={coverGradient}
              onChange={(e) => setCoverGradient(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input-border dark:border-dark-border bg-background-light dark:bg-dark-bg text-sm text-text-main dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {GRADIENTS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary dark:text-dark-text-secondary mb-1">
              Cover image URL (optional)
            </label>
            <input
              type="url"
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input-border dark:border-dark-border bg-background-light dark:bg-dark-bg text-sm text-text-main dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="https://…"
            />
          </div>
        </div>
      </div>

      {/* Content sections */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-main dark:text-white">Content</h2>
          <span className="text-xs text-text-secondary dark:text-dark-text-secondary">
            {sections.length} section{sections.length !== 1 ? "s" : ""}
          </span>
        </div>

        {sections.map((section, idx) => (
          <SectionEditor
            key={idx}
            section={section}
            index={idx}
            total={sections.length}
            onChange={(updated) => {
              const next = [...sections];
              next[idx] = updated;
              handleSectionsChange(next);
            }}
            onRemove={() => {
              if (sections.length === 1) return;
              handleSectionsChange(sections.filter((_, i) => i !== idx));
            }}
            onMoveUp={() => {
              if (idx === 0) return;
              const next = [...sections];
              [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
              handleSectionsChange(next);
            }}
            onMoveDown={() => {
              if (idx === sections.length - 1) return;
              const next = [...sections];
              [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
              handleSectionsChange(next);
            }}
          />
        ))}

        <button
          type="button"
          onClick={() => handleSectionsChange([...sections, { paragraphs: [""] }])}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-dashed border-primary/40 text-primary text-sm font-medium hover:bg-primary/5 transition-colors w-full justify-center"
        >
          <Plus size={15} /> Add section
        </button>
      </div>

      {/* Link previews */}
      {(linkPreviews.length > 0 || fetchingPreviews) && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Link2 size={15} className="text-primary" />
            <h2 className="text-sm font-semibold text-text-main dark:text-white">
              Link previews
            </h2>
            {fetchingPreviews && (
              <Loader2 size={13} className="animate-spin text-text-secondary dark:text-dark-text-secondary" />
            )}
          </div>
          <p className="text-xs text-text-secondary dark:text-dark-text-secondary">
            These are detected from your content and will be shown at the bottom of the post.
          </p>
          <div className="space-y-2">
            {linkPreviews.map((preview) => (
              <LinkPreviewCard
                key={preview.url}
                preview={preview}
                onDismiss={() => {
                  setLinkPreviews((prev) => prev.filter((p) => p.url !== preview.url));
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* FAQ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-main dark:text-white">
            FAQ (optional)
          </h2>
        </div>

        {faqItems.map((item, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-4 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary dark:text-dark-text-secondary">
                FAQ {idx + 1}
              </span>
              <button
                type="button"
                onClick={() => setFaqItems((prev) => prev.filter((_, i) => i !== idx))}
                className="p-1 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <X size={14} />
              </button>
            </div>
            <input
              placeholder="Question"
              value={item.question}
              onChange={(e) => {
                const next = [...faqItems];
                next[idx] = { ...item, question: e.target.value };
                setFaqItems(next);
              }}
              className="w-full px-3 py-2 rounded-lg border border-input-border dark:border-dark-border bg-background-light dark:bg-dark-bg text-sm text-text-main dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <textarea
              rows={2}
              placeholder="Answer"
              value={item.answer}
              onChange={(e) => {
                const next = [...faqItems];
                next[idx] = { ...item, answer: e.target.value };
                setFaqItems(next);
              }}
              className="w-full px-3 py-2 rounded-lg border border-input-border dark:border-dark-border bg-background-light dark:bg-dark-bg text-sm text-text-main dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        ))}

        <button
          type="button"
          onClick={() => setFaqItems((prev) => [...prev, { question: "", answer: "" }])}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-dashed border-input-border dark:border-dark-border text-text-secondary dark:text-dark-text-secondary text-sm font-medium hover:border-primary/40 hover:text-primary transition-colors w-full justify-center"
        >
          <Plus size={15} /> Add FAQ item
        </button>
      </div>

      {/* Bottom action bar */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-input-border dark:border-dark-border">
        <button
          type="button"
          onClick={() => navigate("/blog")}
          className="px-4 py-2 rounded-lg border border-input-border dark:border-dark-border text-sm font-medium text-text-secondary dark:text-dark-text-secondary hover:text-text-main dark:hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {saving && <Loader2 size={15} className="animate-spin" />}
          {saving ? "Saving…" : isCreate ? "Publish post" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
