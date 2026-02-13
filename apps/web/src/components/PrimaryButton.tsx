import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  /** Secondary variant: outline style */
  variant?: 'primary' | 'secondary';
}

export default function PrimaryButton({
  children,
  variant = 'primary',
  className = '',
  disabled,
  ...props
}: PrimaryButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-70';
  const styles =
    variant === 'secondary'
      ? 'bg-surface border border-input-border text-text-main hover:bg-gray-50 dark:hover:bg-gray-700'
      : 'bg-primary text-white shadow-lg hover:bg-primary-dark active:scale-[0.98]';

  return (
    <button
      type="button"
      className={`${base} ${styles} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
