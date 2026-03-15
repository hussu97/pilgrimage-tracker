import { SkeletonBox, SkeletonText } from '../Skeleton';

export default function PlaceDetailSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-bg">
      {/* Mobile-only full-width hero */}
      <SkeletonBox className="h-64 w-full rounded-none lg:hidden" />
      <div className="max-w-6xl mx-auto px-4 py-5 lg:grid lg:grid-cols-5 lg:gap-8">
        <div className="lg:col-span-3 space-y-4">
          {/* Desktop gallery placeholder */}
          <div
            className="hidden lg:block w-full rounded-3xl overflow-hidden"
            style={{ aspectRatio: '16/7' }}
          >
            <SkeletonBox className="w-full h-full rounded-3xl" />
          </div>
          <div className="space-y-2">
            <SkeletonText width="70%" className="h-7" />
            <SkeletonText width="50%" />
          </div>
          <SkeletonBox className="h-20 w-full rounded-xl" />
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <SkeletonBox className="w-5 h-5 rounded" />
                <SkeletonText width="60%" />
              </div>
            ))}
          </div>
          <div className="space-y-3 pt-2">
            <SkeletonText width="100px" className="h-5" />
            {[1, 2].map((i) => (
              <SkeletonBox key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        </div>
        <div className="lg:col-span-2 space-y-4 hidden lg:block">
          <SkeletonBox className="h-48 w-full rounded-xl" />
          <SkeletonBox className="h-32 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
