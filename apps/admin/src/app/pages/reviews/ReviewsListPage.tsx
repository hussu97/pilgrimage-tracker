import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { listReviews } from "@/lib/api/admin";
import type { AdminReview } from "@/lib/api/types";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Pagination } from "@/components/shared/Pagination";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatDate } from "@/lib/utils";

export function ReviewsListPage() {
  const navigate = useNavigate();
  const { page, pageSize, setPage, setPageSize } = usePagination(20);
  const [flaggedFilter, setFlaggedFilter] = useState("");
  const [data, setData] = useState<{ items: AdminReview[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);

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
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        loading={loading}
        rowKey={(r) => r.review_code}
        onRowClick={(r) => navigate(`/reviews/${r.review_code}`)}
        emptyMessage="No reviews found."
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}
