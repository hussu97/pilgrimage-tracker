import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'glass';
}

export default function PrimaryButton({
  children,
  variant = 'primary',
  className = '',
  disabled,
  ...props
}: PrimaryButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-70 active:scale-[0.97]';

  const styles: Record<string, string> = {
    // Solid fill – primary color, white text
    primary: 'bg-primary text-white shadow-lg hover:bg-primary-dark',
    // Light fill – primary at 10% opacity, primary text
    secondary: 'bg-primary/10 text-primary hover:bg-primary/20',
    // Transparent – 1px primary border, primary text
    outline: 'bg-transparent border border-primary text-primary hover:bg-primary/5',
    // Glassmorphism – backdrop-blur, semi-transparent, white text
    glass: 'text-white glass-btn hover:bg-white/30',
  };

  return (
    <button
      type="button"
      className={`${base} ${styles[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
