'use client';

import { SkeletonBox, SkeletonText, SkeletonCircle } from '../Skeleton';

export default function GroupDetailSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-bg">
      <SkeletonBox className="h-52 w-full rounded-none" />
      <div className="lg:grid lg:grid-cols-5 lg:gap-8 lg:px-6 lg:pt-4">
        <div className="lg:col-span-3 px-4 lg:px-0 py-5 space-y-5">
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
        <div className="hidden lg:block lg:col-span-2 lg:sticky lg:top-24 lg:self-start py-5 space-y-4">
          <SkeletonBox className="h-32 w-full rounded-xl" />
          <SkeletonBox className="h-20 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
