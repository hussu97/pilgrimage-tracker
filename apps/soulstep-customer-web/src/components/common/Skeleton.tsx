/** Skeleton loading primitives for SoulStep. */

interface SkeletonBoxProps {
  className?: string;
  width?: string;
  height?: string;
}

export function SkeletonBox({ className = '', width, height }: SkeletonBoxProps) {
  const style: React.CSSProperties = {};
  if (width) style.width = width;
  if (height) style.height = height;
  return (
    <div
      className={`skeleton-shimmer rounded-lg bg-slate-200 dark:bg-dark-surface ${className}`}
      style={style}
      aria-hidden
    />
  );
}

export function SkeletonCircle({
  size = 40,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={`skeleton-shimmer rounded-full bg-slate-200 dark:bg-dark-surface flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}

export function SkeletonText({
  className = '',
  width = '100%',
}: {
  className?: string;
  width?: string;
}) {
  return (
    <div
      className={`skeleton-shimmer h-3 rounded bg-slate-200 dark:bg-dark-surface ${className}`}
      style={{ width }}
      aria-hidden
    />
  );
}
