import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/app/providers';
import { getMyFavorites, removeFavorite } from '@/lib/api/client';
import PlaceCard from '@/components/places/PlaceCard';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import type { Place } from '@/lib/types';

export default function Favorites() {
  const { t } = useI18n();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removingCode, setRemovingCode] = useState<string | null>(null);

  const fetchFavorites = useCallback(() => {
    setLoading(true);
    setError('');
    getMyFavorites()
      .then(setPlaces)
      .catch((e) => setError(e instanceof Error ? e.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const handleRemove = async (e: React.MouseEvent, placeCode: string) => {
    e.preventDefault();
    e.stopPropagation();
    setRemovingCode(placeCode);
    try {
      await removeFavorite(placeCode);
      setPlaces((prev) => prev.filter((p) => p.place_code !== placeCode));
    } catch {
      setError(t('common.error'));
    } finally {
      setRemovingCode(null);
    }
  };

  return (
    <div className="min-h-screen bg-surface-tint max-w-md mx-auto px-4 py-6 md:max-w-4xl pb-24 md:pb-6">
      <header className="mb-6">
        <p className="text-xs text-primary-dark font-semibold uppercase tracking-wider mb-1">{t('nav.saved')}</p>
        <h1 className="text-2xl font-semibold text-text-dark">{t('favorites.title')}</h1>
      </header>

      {loading && <p className="text-text-muted">{t('common.loading')}</p>}
      {error && (
        <ErrorState message={error} onRetry={fetchFavorites} retryLabel={t('common.retry')} />
      )}
      {!loading && !error && places.length === 0 && (
        <EmptyState
          icon="bookmark"
          title={t('favorites.empty')}
          description={t('home.explorePlaces')}
          action={
            <Link to="/home" className="inline-block py-2 px-4 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
              {t('profile.exploreCta')}
            </Link>
          }
        />
      )}
      {!loading && !error && places.length > 0 && (
        <div className="space-y-6 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
          {places.map((place) => (
            <div key={place.place_code} className="relative group/card">
              <PlaceCard place={place} />
              <button
                type="button"
                onClick={(e) => handleRemove(e, place.place_code)}
                disabled={removingCode === place.place_code}
                className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center disabled:opacity-50"
                aria-label={t('places.unfavorite')}
              >
                <span className="material-symbols-outlined text-lg">bookmark</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
