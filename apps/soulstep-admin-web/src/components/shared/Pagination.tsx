import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [50, 100, 200, 500, 1000, 2000],
}: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-text-secondary dark:text-dark-text-secondary">
        {total === 0 ? "No results" : `${from}–${to} of ${total}`}
      </span>

      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface text-text-main dark:text-white text-xs px-2 py-1"
          >
            {pageSizeOptions.map((s) => (
              <option key={s} value={s}>
                {s} / page
              </option>
            ))}
          </select>
        )}

        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={cn(
            "p-1 rounded hover:bg-background-light dark:hover:bg-dark-bg transition-colors",
            page <= 1 && "opacity-40 cursor-not-allowed"
          )}
        >
          <ChevronLeft size={16} />
        </button>

        <span className="text-text-main dark:text-white font-medium">
          {page} / {totalPages || 1}
        </span>

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className={cn(
            "p-1 rounded hover:bg-background-light dark:hover:bg-dark-bg transition-colors",
            page >= totalPages && "opacity-40 cursor-not-allowed"
          )}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
