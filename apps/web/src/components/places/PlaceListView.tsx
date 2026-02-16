import { useSearchParams } from 'react-router-dom';
import type { Place } from '@/lib/types';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import PlaceCardUnified from './PlaceCardUnified';

interface PlaceListViewProps {
  places: Place[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onClearFilters: () => void;
  t: (key: string) => string;
}

export default function PlaceListView({
  places,
  loading,
  error,
  onRetry,
  onClearFilters,
  t,
}: PlaceListViewProps) {
  if (loading && places.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="w-12 h-12 border-[3px] border-slate-200 border-t-primary rounded-full animate-spin" />
        <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">{t('home.loadingPlaces')}</p>
      </div>
    );
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {places.map((place) => (
        <PlaceCardUnified key={place.place_code} place={place} t={t} />
      ))}
    </div>
  );
}
