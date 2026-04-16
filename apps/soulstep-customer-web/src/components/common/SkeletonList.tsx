'use client';

import SkeletonCard from './SkeletonCard';

interface SkeletonListProps {
  count?: number;
}

/**
 * Grid of skeleton cards for list views
 */
export default function SkeletonList({ count = 6 }: SkeletonListProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {[...Array(count)].map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
