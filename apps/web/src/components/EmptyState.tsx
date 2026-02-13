import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      className="text-center py-12 rounded-2xl border border-input-border bg-gray-50 dark:bg-gray-800/50"
      role="status"
      aria-live="polite"
    >
      <span className="material-symbols-outlined text-5xl text-text-muted mb-3 block" aria-hidden>
        {icon}
      </span>
      <p className="text-text-main font-medium mb-1">{title}</p>
      {description && <p className="text-sm text-text-muted mb-4">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
