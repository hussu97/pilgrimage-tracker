import { useEffect, useRef, Fragment } from 'react';
import type { Place } from '@/lib/types';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import SkeletonList from '@/components/common/SkeletonList';
import PlaceCardUnified from './PlaceCardUnified';
import AdBanner from '@/components/ads/AdBanner';

interface PlaceListViewProps {
  places: Place[];
  loading: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  error: string;
  onRetry: () => void;
  onLoadMore?: () => void;
  onClearFilters: () => void;
  t: (key: string) => string;
}

export default function PlaceListView({
  places,
  loading,
  loadingMore,
  hasMore,
  error,
  onRetry,
  onLoadMore,
  onClearFilters,
  t,
}: PlaceListViewProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sentinelRef.current || !onLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          onLoadMore();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, loadingMore]);

  if (loading && places.length === 0) {
    return <SkeletonList count={6} />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }

  if (places.length === 0) {
    return (
      <EmptyState
        icon="search_off"
        title={t('home.noPlacesFound')}
        description={t('home.clearFilters')}
        action={
          <button
            onClick={onClearFilters}
            className="mt-4 px-6 py-3 bg-primary text-white font-bold rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all"
          >
            {t('home.clearFilters')}
          </button>
        }
      />
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {places.map((place, idx) => (
          <Fragment key={place.place_code}>
            <PlaceCardUnified place={place} t={t} />
            {/* In-feed ad every 5th card */}
            {(idx + 1) % 5 === 0 && (
              <div className="col-span-full">
                <AdBanner slot="home-feed" format="horizontal" className="my-2" />
              </div>
            )}
          </Fragment>
        ))}
      </div>
      <div ref={sentinelRef} className="h-4" />
      {loadingMore && (
        <div className="flex justify-center py-6">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
