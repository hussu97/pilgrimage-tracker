import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  // Multi-select
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
}

export function DataTable<T>({
  columns,
  data,
  loading = false,
  emptyMessage = "No data found.",
  rowKey,
  onRowClick,
  selectable = false,
  selectedKeys = new Set(),
  onSelectionChange,
}: DataTableProps<T>) {
  const allKeys = data.map(rowKey);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedKeys.has(k));
  const someSelected = allKeys.some((k) => selectedKeys.has(k));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(allKeys));
    }
  };

  const toggleRow = (key: string) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onSelectionChange(next);
  };

  const colSpan = columns.length + (selectable ? 1 : 0);

  return (
    <div className="overflow-x-auto rounded-xl border border-input-border dark:border-dark-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-input-border dark:border-dark-border bg-background-light dark:bg-dark-bg">
            {selectable && (
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-input-border dark:border-dark-border accent-primary cursor-pointer"
                />
              </th>
            )}
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
              <td colSpan={colSpan} className="py-10 text-center text-text-secondary dark:text-dark-text-secondary">
                Loading...
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="py-10 text-center text-text-secondary dark:text-dark-text-secondary">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row) => {
              const key = rowKey(row);
              const isSelected = selectedKeys.has(key);
              return (
                <tr
                  key={key}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    "border-b border-input-border dark:border-dark-border last:border-0 transition-colors",
                    isSelected
                      ? "bg-primary/5 dark:bg-primary/10"
                      : "bg-white dark:bg-dark-surface hover:bg-background-light dark:hover:bg-dark-bg",
                    onRowClick && "cursor-pointer"
                  )}
                >
                  {selectable && (
                    <td className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(key)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded border-input-border dark:border-dark-border accent-primary cursor-pointer"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className={cn("px-4 py-3 text-text-main dark:text-white", col.className)}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
