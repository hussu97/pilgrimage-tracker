import type { ButtonHTMLAttributes } from 'react';

interface FilterChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  selected?: boolean;
}

export default function FilterChip({
  label,
  selected = false,
  className = '',
  ...props
}: FilterChipProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={`whitespace-nowrap px-5 py-2.5 rounded-xl text-sm font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
        selected
          ? 'bg-primary text-white border-primary shadow-md'
          : 'bg-surface dark:bg-gray-800 border-input-border text-text-secondary hover:border-primary/50 hover:text-primary'
      } ${className}`}
      {...props}
    >
      {label}
    </button>
  );
}
