import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { listUsers } from "@/lib/api/admin";
import type { AdminUser } from "@/lib/api/types";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { SearchInput } from "@/components/shared/SearchInput";
import { Pagination } from "@/components/shared/Pagination";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatDate } from "@/lib/utils";

export function UsersListPage() {
  const navigate = useNavigate();
  const { page, pageSize, setPage, setPageSize } = usePagination(20);
  const [search, setSearch] = useState("");
  const [isActiveFilter, setIsActiveFilter] = useState<string>("");
  const [isAdminFilter, setIsAdminFilter] = useState<string>("");
  const [data, setData] = useState<{ items: AdminUser[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, page_size: pageSize };
      if (search) params.search = search;
      if (isActiveFilter !== "") params.is_active = isActiveFilter === "true";
      if (isAdminFilter !== "") params.is_admin = isAdminFilter === "true";
      const res = await listUsers(params as Parameters<typeof listUsers>[0]);
      setData(res);
    } catch {
      setData({ items: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, isActiveFilter, isAdminFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<AdminUser>[] = [
    {
      key: "code",
      header: "Code",
      render: (u) => (
        <span className="font-mono text-xs text-text-secondary dark:text-dark-text-secondary">
          {u.user_code}
        </span>
      ),
    },
    { key: "display_name", header: "Name", render: (u) => u.display_name },
    {
      key: "email",
      header: "Email",
      render: (u) => (
        <span className="text-text-secondary dark:text-dark-text-secondary">{u.email}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (u) => (
        <StatusBadge
          label={u.is_active ? "Active" : "Inactive"}
          variant={u.is_active ? "success" : "danger"}
        />
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (u) =>
        u.is_admin ? <StatusBadge label="Admin" variant="info" /> : null,
    },
    {
      key: "created_at",
      header: "Joined",
      render: (u) => (
        <span className="text-text-secondary dark:text-dark-text-secondary">
          {formatDate(u.created_at)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-main dark:text-white">Users</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="Search by name or email..."
          className="w-64"
        />
        <select
          value={isActiveFilter}
          onChange={(e) => { setIsActiveFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface text-text-main dark:text-white text-sm px-3 py-2"
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <select
          value={isAdminFilter}
          onChange={(e) => { setIsAdminFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface text-text-main dark:text-white text-sm px-3 py-2"
        >
          <option value="">All Roles</option>
          <option value="true">Admins only</option>
          <option value="false">Non-admins</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        loading={loading}
        rowKey={(u) => u.user_code}
        onRowClick={(u) => navigate(`/users/${u.user_code}`)}
        emptyMessage="No users found."
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
