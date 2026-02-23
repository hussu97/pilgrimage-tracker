import { useEffect, useState, useCallback } from "react";
import { listAuditLog } from "@/lib/api/admin";
import type { AuditLogItem, AuditLogListResponse } from "@/lib/api/types";
import { type Column } from "@/components/shared/DataTable";
import { SearchInput } from "@/components/shared/SearchInput";
import { Pagination } from "@/components/shared/Pagination";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ── Action badge helpers ──────────────────────────────────────────────────────

type ActionVariant = "success" | "danger" | "info" | "warning" | "neutral";

function actionVariant(action: string): ActionVariant {
  switch (action.toLowerCase()) {
    case "create":
      return "success";
    case "delete":
      return "danger";
    case "update":
      return "info";
    case "flag":
    case "unflag":
      return "warning";
    default:
      return "neutral";
  }
}

// ── Entity type options ───────────────────────────────────────────────────────

const ENTITY_TYPE_OPTIONS = [
  { value: "", label: "All Entity Types" },
  { value: "user", label: "User" },
  { value: "place", label: "Place" },
  { value: "review", label: "Review" },
  { value: "check_in", label: "Check-in" },
  { value: "group", label: "Group" },
];

const ACTION_OPTIONS = [
  { value: "", label: "All Actions" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "flag", label: "Flag" },
  { value: "unflag", label: "Unflag" },
  { value: "bulk_deactivate", label: "Bulk Deactivate" },
];

// ── Changes diff block ────────────────────────────────────────────────────────

interface ChangesDiffProps {
  changes: Record<string, { old: unknown; new: unknown }>;
}

function ChangesDiff({ changes }: ChangesDiffProps) {
  const fields = Object.keys(changes);
  return (
    <div className="space-y-2">
      {fields.map((field) => {
        const { old: oldVal, new: newVal } = changes[field];
        return (
          <div key={field} className="rounded-lg overflow-hidden border border-input-border dark:border-dark-border text-xs font-mono">
            <div className="px-3 py-1.5 bg-background-light dark:bg-dark-bg text-text-secondary dark:text-dark-text-secondary font-sans font-semibold text-xs">
              {field}
            </div>
            <div className="grid grid-cols-2 divide-x divide-input-border dark:divide-dark-border">
              <div className="px-3 py-2 bg-red-50 dark:bg-red-900/10 text-red-800 dark:text-red-400 break-all whitespace-pre-wrap">
                <span className="font-sans text-xs text-red-500 dark:text-red-500 select-none">- </span>
                {oldVal === null || oldVal === undefined
                  ? <span className="italic opacity-60">null</span>
                  : typeof oldVal === "object"
                  ? JSON.stringify(oldVal, null, 2)
                  : String(oldVal)}
              </div>
              <div className="px-3 py-2 bg-green-50 dark:bg-green-900/10 text-green-800 dark:text-green-400 break-all whitespace-pre-wrap">
                <span className="font-sans text-xs text-green-500 dark:text-green-500 select-none">+ </span>
                {newVal === null || newVal === undefined
                  ? <span className="italic opacity-60">null</span>
                  : typeof newVal === "object"
                  ? JSON.stringify(newVal, null, 2)
                  : String(newVal)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────────────

export function AuditLogPage() {
  const { page, pageSize, setPage, setPageSize } = usePagination(50);
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [adminCodeSearch, setAdminCodeSearch] = useState("");
  const [data, setData] = useState<AuditLogListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Parameters<typeof listAuditLog>[0] = {
        page,
        page_size: pageSize,
      };
      if (entityTypeFilter) params.entity_type = entityTypeFilter;
      if (actionFilter) params.action = actionFilter;
      if (adminCodeSearch.trim()) params.admin_user_code = adminCodeSearch.trim();
      const res = await listAuditLog(params);
      setData(res);
    } catch {
      setData({ items: [], total: 0, page: 1, page_size: pageSize });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, entityTypeFilter, actionFilter, adminCodeSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleExpand = (logCode: string, hasChanges: boolean) => {
    if (!hasChanges) return;
    setExpandedCode((prev) => (prev === logCode ? null : logCode));
  };

  // Build columns. The expanded detail row is rendered as an extra injected row
  // via a custom table body below — DataTable handles the normal rows; we
  // render the expanded detail inline via a render trick using a hidden row
  // column approach.
  const columns: Column<AuditLogItem>[] = [
    {
      key: "created_at",
      header: "Timestamp",
      render: (item) => (
        <span className="text-text-secondary dark:text-dark-text-secondary whitespace-nowrap">
          {formatDateTime(item.created_at)}
        </span>
      ),
    },
    {
      key: "admin",
      header: "Admin",
      render: (item) => (
        <span className="text-text-main dark:text-white">
          {item.admin_display_name ?? (
            <span className="font-mono text-xs text-text-secondary dark:text-dark-text-secondary">
              {item.admin_user_code}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (item) => (
        <StatusBadge
          label={item.action}
          variant={actionVariant(item.action)}
        />
      ),
    },
    {
      key: "entity_type",
      header: "Entity Type",
      render: (item) => (
        <span className="text-text-main dark:text-white capitalize">
          {item.entity_type.replace("_", " ")}
        </span>
      ),
    },
    {
      key: "entity_code",
      header: "Entity Code",
      render: (item) => (
        <span className="font-mono text-xs text-text-secondary dark:text-dark-text-secondary">
          {item.entity_code}
        </span>
      ),
    },
    {
      key: "changes",
      header: "Changes",
      render: (item) =>
        item.changes ? (
          <span className="text-primary text-xs font-medium">Yes</span>
        ) : (
          <span className="text-text-secondary dark:text-dark-text-secondary">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-main dark:text-white">Audit Log</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <SearchInput
          value={adminCodeSearch}
          onChange={(v) => {
            setAdminCodeSearch(v);
            setPage(1);
          }}
          placeholder="Filter by admin user code..."
          className="w-64"
        />
        <select
          value={entityTypeFilter}
          onChange={(e) => {
            setEntityTypeFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface text-text-main dark:text-white text-sm px-3 py-2"
        >
          {ENTITY_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface text-text-main dark:text-white text-sm px-3 py-2"
        >
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Custom table with expandable rows */}
      <AuditLogTable
        items={data?.items ?? []}
        loading={loading}
        expandedCode={expandedCode}
        onRowClick={toggleExpand}
        columns={columns}
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

// ── AuditLogTable — custom table to support inline expanded rows ──────────────

interface AuditLogTableProps {
  items: AuditLogItem[];
  loading: boolean;
  expandedCode: string | null;
  onRowClick: (logCode: string, hasChanges: boolean) => void;
  columns: Column<AuditLogItem>[];
}

function AuditLogTable({
  items,
  loading,
  expandedCode,
  onRowClick,
  columns,
}: AuditLogTableProps) {
  const colSpan = columns.length;

  return (
    <div className="overflow-x-auto rounded-xl border border-input-border dark:border-dark-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-input-border dark:border-dark-border bg-background-light dark:bg-dark-bg">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary dark:text-dark-text-secondary",
                  col.className
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td
                colSpan={colSpan}
                className="py-10 text-center text-text-secondary dark:text-dark-text-secondary"
              >
                Loading...
              </td>
            </tr>
          ) : items.length === 0 ? (
            <tr>
              <td
                colSpan={colSpan}
                className="py-10 text-center text-text-secondary dark:text-dark-text-secondary"
              >
                No audit log entries found.
              </td>
            </tr>
          ) : (
            items.flatMap((item) => {
              const isExpanded = expandedCode === item.log_code;
              const hasChanges = item.changes !== null;

              return [
                // Data row
                <tr
                  key={item.log_code}
                  onClick={() => onRowClick(item.log_code, hasChanges)}
                  className={cn(
                    "border-b border-input-border dark:border-dark-border transition-colors",
                    isExpanded
                      ? "bg-primary/5 dark:bg-primary/10"
                      : "bg-white dark:bg-dark-surface hover:bg-background-light dark:hover:bg-dark-bg",
                    hasChanges && "cursor-pointer"
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn("px-4 py-3 text-text-main dark:text-white", col.className)}
                    >
                      {col.render(item)}
                    </td>
                  ))}
                </tr>,

                // Expanded diff row
                isExpanded && item.changes ? (
                  <tr
                    key={`${item.log_code}-detail`}
                    className="border-b border-input-border dark:border-dark-border bg-background-light dark:bg-dark-bg"
                  >
                    <td colSpan={colSpan} className="px-4 py-4">
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-text-secondary dark:text-dark-text-secondary uppercase tracking-wide">
                          Changes diff — {item.log_code}
                        </p>
                        <ChangesDiff changes={item.changes} />
                      </div>
                    </td>
                  </tr>
                ) : null,
              ].filter(Boolean);
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
