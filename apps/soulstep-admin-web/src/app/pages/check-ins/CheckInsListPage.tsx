import { useEffect, useState, useCallback } from "react";
import { listCheckIns, deleteCheckIn } from "@/lib/api/admin";
import type { AdminCheckIn } from "@/lib/api/types";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Pagination } from "@/components/shared/Pagination";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatDateTime } from "@/lib/utils";
import { Trash2 } from "lucide-react";

export function CheckInsListPage() {
  const { page, pageSize, setPage, setPageSize } = usePagination(20);
  const [data, setData] = useState<{ items: AdminCheckIn[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listCheckIns({ page, page_size: pageSize });
      setData(res);
    } catch {
      setData({ items: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteCheckIn(deleteTarget);
    setDeleteTarget(null);
    void load();
  };

  const columns: Column<AdminCheckIn>[] = [
    {
      key: "user",
      header: "User",
      render: (ci) => ci.user_display_name ?? ci.user_code,
    },
    {
      key: "place",
      header: "Place",
      render: (ci) => ci.place_name ?? ci.place_code,
    },
    {
      key: "group",
      header: "Group",
      render: (ci) => (
        <span className="text-text-secondary dark:text-dark-text-secondary">
          {ci.group_code ?? "—"}
        </span>
      ),
    },
    {
      key: "note",
      header: "Note",
      render: (ci) => (
        <span className="text-text-secondary dark:text-dark-text-secondary truncate max-w-xs block">
          {ci.note ?? "—"}
        </span>
      ),
    },
    {
      key: "date",
      header: "Date",
      render: (ci) => (
        <span className="text-text-secondary dark:text-dark-text-secondary">
          {formatDateTime(ci.checked_in_at)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (ci) => (
        <button
          onClick={(e) => { e.stopPropagation(); setDeleteTarget(ci.check_in_code); }}
          className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-text-main dark:text-white">Check-ins</h1>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        loading={loading}
        rowKey={(ci) => ci.check_in_code}
        emptyMessage="No check-ins found."
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete check-in?"
        description="Permanently delete this check-in?"
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
