'use client';

import { SkeletonBox, SkeletonText, SkeletonCircle } from '../Skeleton';
import CarouselSkeleton from './CarouselSkeleton';

export default function HomeSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-bg">
      <div className="max-w-2xl lg:max-w-6xl xl:max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="space-y-1">
            <SkeletonBox className="h-8 w-20" />
            <SkeletonText width="80px" />
          </div>
          <div className="flex gap-3">
            <SkeletonCircle size={36} />
            <SkeletonCircle size={36} />
          </div>
        </div>
        <div className="px-4 pb-6 space-y-5 lg:grid lg:grid-cols-5 lg:gap-8 lg:space-y-0">
          <div className="lg:col-span-3 space-y-5">
            {/* Hero card */}
            <SkeletonBox className="h-44 w-full rounded-2xl" />
            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <SkeletonBox key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
            {/* Carousel */}
            <div className="space-y-3">
              <SkeletonText width="140px" />
              <CarouselSkeleton count={3} />
            </div>
            <div className="space-y-3">
              <SkeletonText width="120px" />
              <CarouselSkeleton count={3} />
            </div>
          </div>
          <div className="lg:col-span-2 space-y-5 hidden lg:block">
            <div className="space-y-3">
              <SkeletonText width="140px" />
              <CarouselSkeleton count={2} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
