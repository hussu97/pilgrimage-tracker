import { SkeletonBox, SkeletonText, SkeletonCircle } from '../Skeleton';

export default function GroupDetailSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-bg">
      <SkeletonBox className="h-56 w-full rounded-none" />
      <div className="max-w-6xl mx-auto px-4 py-5 space-y-5">
        <div className="space-y-2">
          <SkeletonText width="60%" className="h-6" />
          <SkeletonText width="40%" />
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <SkeletonBox key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 bg-white dark:bg-dark-surface rounded-xl p-3"
            >
              <SkeletonCircle size={40} />
              <div className="flex-1 space-y-2">
                <SkeletonText width="60%" />
                <SkeletonText width="40%" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
