import React from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

interface FilterChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  selected?: boolean;
}

function FilterChip({ label, selected = false, className = '', ...props }: FilterChipProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={cn(
        'whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold border transition-all active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        selected
          ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
          : 'bg-white dark:bg-dark-surface border-slate-200 dark:border-dark-border text-slate-500 hover:border-primary hover:text-primary shadow-sm',
        className,
      )}
      {...props}
    >
      {label}
    </button>
  );
}

export default React.memo(FilterChip);
