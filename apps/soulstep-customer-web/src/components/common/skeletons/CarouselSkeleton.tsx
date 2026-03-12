import { SkeletonBox, SkeletonText } from '../Skeleton';

export default function CarouselSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex gap-3 overflow-x-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="w-[calc((100vw-2.5rem)/2.3)] lg:w-48 flex-shrink-0 rounded-xl overflow-hidden border border-slate-100 dark:border-dark-border"
        >
          <SkeletonBox className="h-28 w-full rounded-none" />
          <div className="p-2.5 space-y-1.5">
            <SkeletonText width="80%" />
            <SkeletonText width="50%" />
          </div>
        </div>
      ))}
    </div>
  );
}
