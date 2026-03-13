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
import { BarChart2, CheckCircle, AlertCircle, PenLine, RefreshCw, DollarSign } from "lucide-react";
import type { Column } from "@/components/shared/DataTable";

export function SEODashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<SEOStats | null>(null);
  const [items, setItems] = useState<SEOListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [withTranslations, setWithTranslations] = useState(false);
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

  const handleBulkGenerate = async () => {
    const msg = withTranslations
      ? "Generate SEO content for all places missing it, then translate to AR, HI, TE, ML? This may take several minutes."
      : "Generate SEO content for all places missing it? This may take a moment.";
    if (!window.confirm(msg)) return;
    setGenerating(true);
    try {
      const result = await bulkGenerateSEO({ force: false, translate: withTranslations });
      const translationNote = withTranslations
        ? ` Translations: ${result.translated} written, ${result.translation_errors} errors.`
        : "";
      alert(`SEO generation complete: ${result.generated} generated, ${result.errors} errors.${translationNote}`);
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
          <label className="flex items-center gap-1.5 text-sm text-text-secondary dark:text-dark-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={withTranslations}
              onChange={(e) => setWithTranslations(e.target.checked)}
              className="rounded"
              disabled={generating}
            />
            + translations
          </label>
          <button
            onClick={handleBulkGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className={generating ? "animate-spin" : ""} />
            {generating ? (withTranslations ? "Generating + translating…" : "Generating…") : "Bulk Generate"}
          </button>
        </div>
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
              <DollarSign size={13} />
              Translation Cost
            </div>
            <div className="text-xl font-semibold text-text-main dark:text-white">
              ${stats.translation_cost_usd.toFixed(4)}
            </div>
            <div className="text-xs text-text-secondary dark:text-dark-text-secondary">
              {stats.translation_chars.toLocaleString()} chars translated
            </div>
          </div>
        </div>
      )}

      {/* Coverage bar */}
      {stats && (
        <div className="bg-white dark:bg-dark-surface rounded-lg border border-input-border dark:border-dark-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-text-main dark:text-white flex items-center gap-2">
              <BarChart2 size={14} /> SEO Coverage
            </span>
            <span className="text-sm text-text-secondary dark:text-dark-text-secondary">
              {stats.coverage_pct}%
            </span>
          </div>
          <div className="h-2 bg-background-light dark:bg-dark-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${stats.coverage_pct}%` }}
            />
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
