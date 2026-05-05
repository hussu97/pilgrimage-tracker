import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Eye, MousePointerClick, FileText, Globe } from "lucide-react";
import { listAdminBlogPosts, deleteBlogPost } from "@/lib/api/blog";
import type { AdminBlogPost } from "@/lib/api/types";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { SearchInput } from "@/components/shared/SearchInput";
import { Pagination } from "@/components/shared/Pagination";
import { StatCard } from "@/components/shared/StatCard";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatDate } from "@/lib/utils";

const CATEGORY_OPTIONS = [
  "All",
  "Islam",
  "Hinduism",
  "Christianity",
  "Buddhism",
  "Sikhism",
  "Travel Guide",
  "Spirituality",
];

export function BlogListPage() {
  const navigate = useNavigate();
  const { page, pageSize, setPage, setPageSize } = usePagination(50);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [publishedFilter, setPublishedFilter] = useState<"" | "true" | "false">("");
  const [data, setData] = useState<{ items: AdminBlogPost[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, page_size: pageSize };
      if (search) params.search = search;
      if (categoryFilter) params.category = categoryFilter;
      if (publishedFilter !== "") params.is_published = publishedFilter === "true";
      const res = await listAdminBlogPosts(params as Parameters<typeof listAdminBlogPosts>[0]);
      setData(res);
    } catch {
      setData({ items: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, categoryFilter, publishedFilter]);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = async (post: AdminBlogPost) => {
    if (!confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    setDeleting(post.post_code);
    try {
      await deleteBlogPost(post.post_code);
      void load();
    } finally {
      setDeleting(null);
    }
  };

  const totalViews = data?.items.reduce((s, p) => s + p.view_count, 0) ?? 0;
  const totalClicks = data?.items.reduce((s, p) => s + p.link_click_count, 0) ?? 0;
  const totalPublished = data?.items.filter((p) => p.is_published).length ?? 0;

  const columns: Column<AdminBlogPost>[] = [
    {
      key: "title",
      header: "Title",
      render: (p) => (
        <div>
          <p className="font-medium text-text-main dark:text-white line-clamp-1">{p.title}</p>
          <p className="text-xs text-text-secondary dark:text-dark-text-secondary mt-0.5">/{p.slug}</p>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (p) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
          {p.category}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (p) => (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
            p.is_published
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              : "bg-slate-100 text-slate-600 dark:bg-dark-border dark:text-dark-text-secondary"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${p.is_published ? "bg-emerald-500" : "bg-slate-400"}`} />
          {p.is_published ? "Published" : "Draft"}
        </span>
      ),
    },
    {
      key: "views",
      header: "Views",
      render: (p) => (
        <span className="flex items-center gap-1 text-sm text-text-secondary dark:text-dark-text-secondary">
          <Eye size={13} />
          {p.view_count.toLocaleString()}
        </span>
      ),
    },
    {
      key: "clicks",
      header: "Link Clicks",
      render: (p) => (
        <span className="flex items-center gap-1 text-sm text-text-secondary dark:text-dark-text-secondary">
          <MousePointerClick size={13} />
          {p.link_click_count.toLocaleString()}
        </span>
      ),
    },
    {
      key: "reading_time",
      header: "Read time",
      render: (p) => (
        <span className="text-sm text-text-secondary dark:text-dark-text-secondary">
          {p.reading_time} min
        </span>
      ),
    },
    {
      key: "published_at",
      header: "Published",
      render: (p) => (
        <span className="text-sm text-text-secondary dark:text-dark-text-secondary">
          {formatDate(p.published_at)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (p) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/blog/${p.post_code}/edit`); }}
            className="px-3 py-1 rounded-lg text-xs font-medium border border-input-border dark:border-dark-border text-text-secondary dark:text-dark-text-secondary hover:text-primary hover:border-primary transition-colors"
          >
            Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); void handleDelete(p); }}
            disabled={deleting === p.post_code}
            className="px-3 py-1 rounded-lg text-xs font-medium border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
          >
            {deleting === p.post_code ? "Deleting…" : "Delete"}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-main dark:text-white">Blog Posts</h1>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-0.5">
            Create and manage editorial blog content
          </p>
        </div>
        <button
          onClick={() => navigate("/blog/new")}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} /> New Post
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Posts" value={data?.total ?? "—"} />
        <StatCard label="Published" value={totalPublished} />
        <StatCard
          label="Total Views"
          value={totalViews.toLocaleString()}
        />
        <StatCard
          label="Link Clicks"
          value={totalClicks.toLocaleString()}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="Search by title, description…"
          className="w-64"
        />
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface text-sm text-text-main dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {CATEGORY_OPTIONS.map((cat) => (
            <option key={cat} value={cat === "All" ? "" : cat}>
              {cat}
            </option>
          ))}
        </select>
        <select
          value={publishedFilter}
          onChange={(e) => { setPublishedFilter(e.target.value as "" | "true" | "false"); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface text-sm text-text-main dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All statuses</option>
          <option value="true">Published</option>
          <option value="false">Drafts</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        loading={loading}
        onRowClick={(p) => navigate(`/blog/${p.post_code}/edit`)}
        keyExtractor={(p) => p.post_code}
        emptyMessage="No blog posts found"
      />

      {data && data.total > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={data.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}
    </div>
  );
}
