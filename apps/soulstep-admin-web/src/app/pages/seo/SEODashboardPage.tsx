import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getSEOStats, listSEOPlaces, bulkGenerateSEO } from "@/lib/api/admin";
import type { SEOStats, SEOListItem } from "@/lib/api/types";
import { DataTable } from "@/components/shared/DataTable";
import { Pagination } from "@/components/shared/Pagination";
import { SearchInput } from "@/components/shared/SearchInput";
import { StatCard } from "@/components/shared/StatCard";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatDate } from "@/lib/utils";
import { BarChart2, CheckCircle, AlertCircle, PenLine, RefreshCw, Globe, Clock } from "lucide-react";
import type { Column } from "@/components/shared/DataTable";

const ALL_LANGS = ["en", "ar", "hi", "te", "ml"];
const LANG_NAMES: Record<string, string> = { en: "English", ar: "Arabic", hi: "Hindi", te: "Telugu", ml: "Malayalam" };

export function SEODashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<SEOStats | null>(null);
  const [items, setItems] = useState<SEOListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(["en"]);
  const [search, setSearch] = useState("");
  const [religion, setReligion] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const { page, pageSize, setPage, setPageSize } = usePagination(50);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, listRes] = await Promise.all([
        getSEOStats(),
        listSEOPlaces({
          page,
          page_size: pageSize,
          search: search || undefined,
          religion: religion || undefined,
          missing_only: missingOnly || undefined,
        }),
      ]);
      setStats(statsRes);
      setItems(listRes.items);
      setTotal(listRes.total);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, religion, missingOnly]);

  useEffect(() => { void load(); }, [load]);

  const toggleLang = (lang: string) => {
    setSelectedLangs((prev) => {
      if (prev.includes(lang)) {
        const next = prev.filter((l) => l !== lang);
        return next.length === 0 ? ["en"] : next;
      }
      return [...prev, lang];
    });
  };

  const handleBulkGenerate = async () => {
    const langNames = selectedLangs.map((l) => LANG_NAMES[l]).join(", ");
    if (!window.confirm(`Generate SEO content for languages: ${langNames}? This may take several minutes.`)) return;
    setGenerating(true);
    try {
      const result = await bulkGenerateSEO({ force: false, langs: selectedLangs });
      const langParts = Object.entries(result.lang_generated)
        .map(([l, c]) => `${LANG_NAMES[l] ?? l}: ${c}`)
        .join(", ");
      const langNote = langParts ? ` Translations: ${langParts}.` : "";
      alert(`SEO generation complete: ${result.generated} generated, ${result.errors} errors.${langNote}`);
      void load();
    } finally {
      setGenerating(false);
    }
  };

  const columns: Column<SEOListItem>[] = [
    {
      key: "name",
      header: "Place",
      render: (row) => (
        <div>
          <div className="font-medium text-text-main dark:text-white">{row.name}</div>
          <div className="text-xs text-text-secondary dark:text-dark-text-secondary">
            {row.religion} · {row.place_type}
          </div>
        </div>
      ),
    },
    {
      key: "slug",
      header: "Slug",
      render: (row) =>
        row.slug ? (
          <code className="text-xs bg-background-light dark:bg-dark-bg px-1.5 py-0.5 rounded text-text-main dark:text-white">
            {row.slug}
          </code>
        ) : (
          <span className="text-text-secondary dark:text-dark-text-secondary text-xs">—</span>
        ),
    },
    {
      key: "seo_title",
      header: "SEO Title",
      render: (row) => (
        <span className="text-sm truncate max-w-xs block">
          {row.seo_title ?? <span className="text-text-secondary dark:text-dark-text-secondary text-xs">—</span>}
        </span>
      ),
    },
    {
      key: "has_seo",
      header: "Status",
      render: (row) => (
        <div className="flex items-center gap-1.5">
          {row.has_seo ? (
            <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-medium">
              <CheckCircle size={12} /> Generated
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs font-medium">
              <AlertCircle size={12} /> Missing
            </span>
          )}
          {row.is_manually_edited && (
            <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 text-xs font-medium ml-1">
              <PenLine size={11} /> Manual
            </span>
          )}
        </div>
      ),
    },
    {
      key: "updated_at",
      header: "Last Updated",
      render: (row) => (
        <span className="text-sm text-text-secondary dark:text-dark-text-secondary">
          {row.updated_at ? formatDate(row.updated_at) : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-main dark:text-white">SEO Dashboard</h1>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-0.5">
            Manage SEO metadata, slugs, and discoverability for all sacred sites.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/seo/templates")}
            className="flex items-center gap-1.5 text-sm px-3 py-2 border border-input-border dark:border-dark-border rounded-lg hover:bg-background-light dark:hover:bg-dark-bg text-text-main dark:text-white transition-colors"
          >
            <Globe size={14} /> Templates
          </button>
          <button
            onClick={handleBulkGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className={generating ? "animate-spin" : ""} />
            {generating ? "Generating…" : "Bulk Generate"}
          </button>
        </div>
      </div>

      {/* Language selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-text-secondary dark:text-dark-text-secondary">Generate for:</span>
        {ALL_LANGS.map((lang) => (
          <button
            key={lang}
            onClick={() => toggleLang(lang)}
            disabled={generating}
            className={[
              "px-2.5 py-1 text-xs rounded-full border transition-colors",
              selectedLangs.includes(lang)
                ? "bg-primary text-white border-primary"
                : "border-input-border dark:border-dark-border text-text-secondary dark:text-dark-text-secondary hover:border-primary hover:text-primary",
            ].join(" ")}
          >
            {LANG_NAMES[lang]}
          </button>
        ))}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard label="Total Places" value={stats.total_places} />
          <StatCard
            label="With SEO"
            value={`${stats.places_with_seo} (${stats.coverage_pct}%)`}
          />
          <StatCard label="Missing SEO" value={stats.places_missing_seo} />
          <StatCard label="Manually Edited" value={stats.places_manually_edited} />
          <div className="bg-white dark:bg-dark-surface rounded-lg border border-input-border dark:border-dark-border p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-xs text-text-secondary dark:text-dark-text-secondary">
              <Clock size={13} />
              Stale SEO
            </div>
            <div className="text-xl font-semibold text-text-main dark:text-white">
              {stats.stale_count}
            </div>
            <div className="text-xs text-text-secondary dark:text-dark-text-secondary">
              places need regeneration
            </div>
          </div>
        </div>
      )}

      {/* Coverage bar + per-language breakdown */}
      {stats && (
        <div className="bg-white dark:bg-dark-surface rounded-lg border border-input-border dark:border-dark-border p-4 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-text-main dark:text-white flex items-center gap-2">
              <BarChart2 size={14} /> SEO Coverage
            </span>
            <span className="text-sm text-text-secondary dark:text-dark-text-secondary">
              {stats.coverage_pct}% (English)
            </span>
          </div>
          <div className="h-2 bg-background-light dark:bg-dark-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${stats.coverage_pct}%` }}
            />
          </div>

          {/* Per-language bars */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            {Object.entries(stats.lang_coverage).map(([lang, count]) => {
              const pct = stats.total_places > 0 ? Math.round((count / stats.total_places) * 100) : 0;
              return (
                <div key={lang} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary dark:text-dark-text-secondary">{LANG_NAMES[lang] ?? lang}</span>
                    <span className="text-text-main dark:text-white font-medium">{count} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 bg-background-light dark:bg-dark-bg rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/60 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="Search places…"
          className="w-64"
        />
        <select
          value={religion}
          onChange={(e) => { setReligion(e.target.value); setPage(1); }}
          className="h-9 rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface text-text-main dark:text-white text-sm px-3"
        >
          <option value="">All religions</option>
          <option value="islam">Islam</option>
          <option value="christianity">Christianity</option>
          <option value="hinduism">Hinduism</option>
          <option value="buddhism">Buddhism</option>
          <option value="sikhism">Sikhism</option>
          <option value="judaism">Judaism</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-text-secondary dark:text-dark-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={missingOnly}
            onChange={(e) => { setMissingOnly(e.target.checked); setPage(1); }}
            className="rounded"
          />
          Missing only
        </label>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={items}
        rowKey={(row) => row.place_code}
        loading={loading}
        emptyMessage="No places found."
        onRowClick={(row) => navigate(`/seo/${row.place_code}`)}
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}
