import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  className?: string;
}

export function StatCard({ label, value, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-5",
        className
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-text-secondary dark:text-dark-text-secondary mb-1">
        {label}
      </p>
      <p className="text-2xl font-semibold text-text-main dark:text-white">{value}</p>
    </div>
  );
}
