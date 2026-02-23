import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

interface SearchBarProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  'aria-label'?: string;
}

export default function SearchBar({
  value,
  onValueChange,
  placeholder = 'Search...',
  'aria-label': ariaLabel = 'Search',
  className = '',
  ...props
}: SearchBarProps) {
  return (
    <div className="relative flex items-center border-b border-slate-200 focus-within:border-primary transition-colors pb-2">
      <span
        className="material-symbols-outlined text-text-muted text-xl mr-3 font-light pointer-events-none"
        aria-hidden
      >
        search
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={cn(
          'flex-1 bg-transparent border-none p-0 text-lg font-light text-text-main placeholder-text-muted focus:ring-0',
          className,
        )}
        {...props}
      />
    </div>
  );
}
