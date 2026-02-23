import { cn } from "@/lib/utils";

type Variant = "success" | "danger" | "warning" | "neutral" | "info";

interface StatusBadgeProps {
  label: string;
  variant?: Variant;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  success: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  danger: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  neutral: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-dark-text-secondary",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

export function StatusBadge({ label, variant = "neutral", className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className
      )}
    >
      {label}
    </span>
  );
}
