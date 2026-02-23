import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { listGroups } from "@/lib/api/admin";
import type { AdminGroup } from "@/lib/api/types";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { SearchInput } from "@/components/shared/SearchInput";
import { Pagination } from "@/components/shared/Pagination";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatDate } from "@/lib/utils";

export function GroupsListPage() {
  const navigate = useNavigate();
  const { page, pageSize, setPage, setPageSize } = usePagination(20);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<{ items: AdminGroup[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);

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
      <h1 className="text-xl font-semibold text-text-main dark:text-white">Groups</h1>

      <SearchInput
        value={search}
        onChange={(v) => { setSearch(v); setPage(1); }}
        placeholder="Search by name..."
        className="w-64"
      />

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        loading={loading}
        rowKey={(g) => g.group_code}
        onRowClick={(g) => navigate(`/groups/${g.group_code}`)}
        emptyMessage="No groups found."
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
