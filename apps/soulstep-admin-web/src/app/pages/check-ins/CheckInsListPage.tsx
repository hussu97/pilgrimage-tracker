import { useEffect, useState, useCallback } from "react";
import { listCheckIns, deleteCheckIn, bulkDeleteCheckIns, exportUrl } from "@/lib/api/admin";
import type { AdminCheckIn } from "@/lib/api/types";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Pagination } from "@/components/shared/Pagination";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatDateTime } from "@/lib/utils";
import { Trash2 } from "lucide-react";

export function CheckInsListPage() {
  const { page, pageSize, setPage, setPageSize } = usePagination(20);
  const [data, setData] = useState<{ items: AdminCheckIn[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  const handleBulkDelete = async () => {
    await bulkDeleteCheckIns(Array.from(selected));
    setSelected(new Set());
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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-main dark:text-white">Check-ins</h1>
        <div className="relative group">
          <button className="rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface text-text-main dark:text-white text-sm px-3 py-2 flex items-center gap-1">
            Export ▾
          </button>
          <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col gap-1 bg-white dark:bg-dark-surface border border-input-border dark:border-dark-border rounded-lg shadow-lg p-1 z-10 min-w-[120px]">
            <a href={exportUrl("check-ins", "csv")} download className="px-3 py-1.5 text-sm text-text-main dark:text-white hover:bg-background-light dark:hover:bg-dark-bg rounded">CSV</a>
            <a href={exportUrl("check-ins", "json")} download className="px-3 py-1.5 text-sm text-text-main dark:text-white hover:bg-background-light dark:hover:bg-dark-bg rounded">JSON</a>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        loading={loading}
        rowKey={(ci) => ci.check_in_code}
        emptyMessage="No check-ins found."
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
          { label: "Delete", onClick: () => { void handleBulkDelete(); }, variant: "danger" },
        ]}
        onClear={() => setSelected(new Set())}
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
