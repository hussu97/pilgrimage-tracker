import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { listReviews, bulkFlagReviews, bulkUnflagReviews, bulkDeleteReviews, exportUrl } from "@/lib/api/admin";
import type { AdminReview } from "@/lib/api/types";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Pagination } from "@/components/shared/Pagination";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatDate } from "@/lib/utils";

export function ReviewsListPage() {
  const navigate = useNavigate();
  const { page, pageSize, setPage, setPageSize } = usePagination(20);
  const [flaggedFilter, setFlaggedFilter] = useState("");
  const [data, setData] = useState<{ items: AdminReview[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, page_size: pageSize };
      if (flaggedFilter !== "") params.is_flagged = flaggedFilter === "true";
      const res = await listReviews(params as Parameters<typeof listReviews>[0]);
      setData(res);
    } catch {
      setData({ items: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, flaggedFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleBulkFlag = async () => {
    await bulkFlagReviews(Array.from(selected));
    setSelected(new Set());
    void load();
  };

  const handleBulkUnflag = async () => {
    await bulkUnflagReviews(Array.from(selected));
    setSelected(new Set());
    void load();
  };

  const handleBulkDelete = async () => {
    await bulkDeleteReviews(Array.from(selected));
    setSelected(new Set());
    void load();
  };

  const columns: Column<AdminReview>[] = [
    {
      key: "place",
      header: "Place",
      render: (r) => r.place_name ?? r.place_code,
    },
    {
      key: "user",
      header: "User",
      render: (r) => (
        <span className="text-text-secondary dark:text-dark-text-secondary">
          {r.user_display_name ?? "Anonymous"}
        </span>
      ),
    },
    { key: "rating", header: "Rating", render: (r) => `${r.rating}/5` },
    {
      key: "title",
      header: "Title",
      render: (r) => r.title ?? <span className="text-text-secondary dark:text-dark-text-secondary italic">No title</span>,
    },
    {
      key: "flagged",
      header: "Status",
      render: (r) =>
        r.is_flagged ? <StatusBadge label="Flagged" variant="danger" /> : null,
    },
    {
      key: "created_at",
      header: "Date",
      render: (r) => (
        <span className="text-text-secondary dark:text-dark-text-secondary">{formatDate(r.created_at)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-main dark:text-white">Reviews</h1>
      </div>

      <div className="flex gap-3">
        <select
          value={flaggedFilter}
          onChange={(e) => { setFlaggedFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface text-text-main dark:text-white text-sm px-3 py-2"
        >
          <option value="">All Reviews</option>
          <option value="true">Flagged only</option>
          <option value="false">Not flagged</option>
        </select>
        <div className="relative group">
          <button className="rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface text-text-main dark:text-white text-sm px-3 py-2 flex items-center gap-1">
            Export ▾
          </button>
          <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col gap-1 bg-white dark:bg-dark-surface border border-input-border dark:border-dark-border rounded-lg shadow-lg p-1 z-10 min-w-[120px]">
            <a href={exportUrl("reviews", "csv")} download className="px-3 py-1.5 text-sm text-text-main dark:text-white hover:bg-background-light dark:hover:bg-dark-bg rounded">CSV</a>
            <a href={exportUrl("reviews", "json")} download className="px-3 py-1.5 text-sm text-text-main dark:text-white hover:bg-background-light dark:hover:bg-dark-bg rounded">JSON</a>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        loading={loading}
        rowKey={(r) => r.review_code}
        onRowClick={(r) => navigate(`/reviews/${r.review_code}`)}
        emptyMessage="No reviews found."
        selectable
        selectedKeys={selected}
        onSelectionChange={setSelected}
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <BulkActionBar
        selectedCount={selected.size}
        actions={[
          { label: "Flag", onClick: () => { void handleBulkFlag(); } },
          { label: "Unflag", onClick: () => { void handleBulkUnflag(); } },
          { label: "Delete", onClick: () => { void handleBulkDelete(); }, variant: "danger" },
        ]}
        onClear={() => setSelected(new Set())}
      />
    </div>
  );
}
