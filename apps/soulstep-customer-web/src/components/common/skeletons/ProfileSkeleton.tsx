'use client';

import { SkeletonBox, SkeletonText, SkeletonCircle } from '../Skeleton';

export default function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-bg max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-4">
        <SkeletonCircle size={72} />
        <div className="flex-1 space-y-2">
          <SkeletonText width="60%" className="h-5" />
          <SkeletonText width="40%" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <SkeletonBox key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <SkeletonBox key={i} className="h-12 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
