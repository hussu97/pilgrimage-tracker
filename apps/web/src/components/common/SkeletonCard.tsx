/**
 * Skeleton loading placeholder for place cards
 */
export default function SkeletonCard() {
  return (
    <div className="group relative flex flex-col bg-white dark:bg-dark-surface rounded-3xl overflow-hidden shadow-soft border border-slate-100 dark:border-dark-border animate-pulse">
      {/* Image skeleton */}
      <div className="relative h-48 bg-slate-200 dark:bg-slate-700" />

      {/* Content skeleton */}
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex justify-between items-start gap-2 mb-1">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-8" />
        </div>

        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mb-3 mt-1" />

        <div className="mt-auto flex items-center justify-between pt-3 border-t border-slate-50 dark:border-dark-border">
          <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-16" />
          <div className="h-5 w-5 bg-slate-200 dark:bg-slate-700 rounded-full" />
        </div>
      </div>
    </div>
  );
}
