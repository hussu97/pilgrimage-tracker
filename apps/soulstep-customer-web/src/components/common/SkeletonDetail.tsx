/**
 * Skeleton loading placeholder for place detail page
 */
export default function SkeletonDetail() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-bg animate-pulse">
      {/* Hero skeleton */}
      <div className="h-80 bg-slate-200 dark:bg-slate-700" />

      {/* Content skeleton */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Title and rating */}
        <div className="flex justify-between items-start mb-4">
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-16" />
        </div>

        {/* Address */}
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3 mb-6" />

        {/* Action buttons */}
        <div className="flex gap-4 mb-8">
          <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded-2xl w-32" />
          <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded-2xl w-32" />
        </div>

        {/* Description */}
        <div className="space-y-2 mb-8">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full" />
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-5/6" />
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-4/6" />
        </div>

        {/* Specifications grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-200 dark:bg-slate-700 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
