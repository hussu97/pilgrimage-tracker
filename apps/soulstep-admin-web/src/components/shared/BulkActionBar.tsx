import { cn } from "@/lib/utils";

export interface BulkAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
}

interface BulkActionBarProps {
  selectedCount: number;
  actions: BulkAction[];
  onClear: () => void;
}

export function BulkActionBar({ selectedCount, actions, onClear }: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-lg px-5 py-3">
      <span className="text-sm font-medium text-text-main dark:text-white whitespace-nowrap">
        {selectedCount} selected
      </span>
      <div className="h-4 w-px bg-input-border dark:bg-dark-border" />
      <div className="flex items-center gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            disabled={action.disabled}
            className={cn(
              "text-sm font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              action.variant === "danger"
                ? "bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20"
                : "bg-primary/10 text-primary hover:bg-primary/20"
            )}
          >
            {action.label}
          </button>
        ))}
      </div>
      <div className="h-4 w-px bg-input-border dark:bg-dark-border" />
      <button
        onClick={onClear}
        className="text-sm text-text-secondary dark:text-dark-text-secondary hover:text-text-main dark:hover:text-white transition-colors"
      >
        Clear
      </button>
    </div>
  );
}
