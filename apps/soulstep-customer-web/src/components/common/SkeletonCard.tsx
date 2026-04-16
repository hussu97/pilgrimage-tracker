'use client';

/**
 * Skeleton loading placeholder for place cards.
 * Uses a left-to-right shimmer animation (1.5s) instead of flat pulse.
 */
export default function SkeletonCard() {
  return (
    <div className="block bg-surface dark:bg-dark-surface rounded-2xl overflow-hidden shadow-card border border-slate-100 dark:border-dark-border">
      {/* Image skeleton with shimmer */}
      <div className="relative h-48 skeleton-shimmer dark:skeleton-shimmer" />

      {/* Content skeleton */}
      <div className="p-4">
        <div className="flex justify-between items-start gap-2 mb-2">
          <div className="h-4 skeleton-shimmer dark:skeleton-shimmer rounded w-3/4" />
          <div className="h-6 w-12 skeleton-shimmer dark:skeleton-shimmer rounded-xl" />
        </div>

        <div className="h-3 skeleton-shimmer dark:skeleton-shimmer rounded w-1/2 mb-4 mt-2" />

        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-dark-border">
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-4 skeleton-shimmer dark:skeleton-shimmer rounded-full" />
            <div className="h-3 w-8 skeleton-shimmer dark:skeleton-shimmer rounded" />
          </div>
          <div className="h-3 w-16 skeleton-shimmer dark:skeleton-shimmer rounded" />
        </div>
      </div>
    </div>
  );
}
