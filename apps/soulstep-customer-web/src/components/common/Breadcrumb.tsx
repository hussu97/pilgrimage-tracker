import { Link } from 'react-router-dom';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 text-xs text-text-muted dark:text-dark-text-secondary overflow-x-auto"
    >
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5 shrink-0">
          {i > 0 && <span className="text-slate-300 dark:text-dark-border">/</span>}
          {item.href && i < items.length - 1 ? (
            <Link to={item.href} className="hover:text-primary transition-colors">
              {item.label}
            </Link>
          ) : (
            <span
              className={
                i === items.length - 1
                  ? 'text-text-main dark:text-white font-medium truncate max-w-[200px]'
                  : ''
              }
            >
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
