import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { listGroups, bulkDeleteGroups, exportUrl } from "@/lib/api/admin";
import type { AdminGroup } from "@/lib/api/types";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { SearchInput } from "@/components/shared/SearchInput";
import { Pagination } from "@/components/shared/Pagination";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatDate } from "@/lib/utils";

export function GroupsListPage() {
  const navigate = useNavigate();
  const { page, pageSize, setPage, setPageSize } = usePagination(50);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<{ items: AdminGroup[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, page_size: pageSize };
      if (search) params.search = search;
      const res = await listGroups(params as Parameters<typeof listGroups>[0]);
      setData(res);
    } catch {
      setData({ items: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleBulkDelete = async () => {
    await bulkDeleteGroups(Array.from(selected));
    setSelected(new Set());
    void load();
  };

  const columns: Column<AdminGroup>[] = [
    { key: "name", header: "Name", render: (g) => g.name },
    { key: "members", header: "Members", render: (g) => g.member_count },
    { key: "places", header: "Places", render: (g) => g.place_count },
    {
      key: "private",
      header: "Visibility",
      render: (g) =>
        g.is_private ? (
          <StatusBadge label="Private" variant="warning" />
        ) : (
          <StatusBadge label="Public" variant="success" />
        ),
    },
    {
      key: "created_at",
      header: "Created",
      render: (g) => (
        <span className="text-text-secondary dark:text-dark-text-secondary">
          {formatDate(g.created_at)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-main dark:text-white">Groups</h1>
      </div>

      <div className="flex flex-wrap gap-3">
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="Search by name..."
          className="w-64"
        />
        <div className="relative group">
          <button className="rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface text-text-main dark:text-white text-sm px-3 py-2 flex items-center gap-1">
            Export ▾
          </button>
          <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col gap-1 bg-white dark:bg-dark-surface border border-input-border dark:border-dark-border rounded-lg shadow-lg p-1 z-10 min-w-[120px]">
            <a href={exportUrl("groups", "csv")} download className="px-3 py-1.5 text-sm text-text-main dark:text-white hover:bg-background-light dark:hover:bg-dark-bg rounded">CSV</a>
            <a href={exportUrl("groups", "json")} download className="px-3 py-1.5 text-sm text-text-main dark:text-white hover:bg-background-light dark:hover:bg-dark-bg rounded">JSON</a>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        loading={loading}
        rowKey={(g) => g.group_code}
        onRowClick={(g) => navigate(`/groups/${g.group_code}`)}
        emptyMessage="No groups found."
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
    </div>
  );
}
