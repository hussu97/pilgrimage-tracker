import { SkeletonBox, SkeletonText } from '../Skeleton';

export default function GroupListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3 px-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 bg-white dark:bg-dark-surface rounded-xl p-3"
        >
          <SkeletonBox className="w-14 h-14 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonText width="70%" />
            <SkeletonText width="40%" />
            <SkeletonBox className="h-1.5 w-full rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
