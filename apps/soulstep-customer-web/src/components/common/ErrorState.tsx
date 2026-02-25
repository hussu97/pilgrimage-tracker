import type { ReactNode } from 'react';
import { useI18n } from '@/app/providers';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  action?: ReactNode;
}

export default function ErrorState({ message, onRetry, retryLabel, action }: ErrorStateProps) {
  const { t } = useI18n();
  const label = retryLabel ?? t('common.retry');
  return (
    <div
      className="py-6 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 px-4"
      role="alert"
    >
      <p className="text-red-600 dark:text-red-400 mb-3">{message}</p>
      <div className="flex flex-wrap gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {label}
          </button>
        )}
        {action}
      </div>
    </div>
  );
}
