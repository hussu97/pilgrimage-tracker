import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n, useFeedback } from '@/app/providers';
import { useDocumentTitle } from '@/lib/hooks/useDocumentTitle';
import { getMyFavorites, removeFavorite } from '@/lib/api/client';
import PlaceCardUnified from '@/components/places/PlaceCardUnified';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import type { Place } from '@/lib/types';
import { Fragment } from 'react';
import AdBanner from '@/components/ads/AdBanner';

export default function Favorites() {
  const { t } = useI18n();
  useDocumentTitle(t('nav.favorites'));
  const { showSuccess, showError } = useFeedback();
  const navigate = useNavigate();
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
      showSuccess(t('feedback.favoriteRemoved'));
    } catch {
      showError(t('feedback.error'));
    } finally {
      setRemovingCode(null);
    }
  };

  return (
    <div className="min-h-screen bg-surface-tint dark:bg-dark-bg max-w-md mx-auto px-4 py-6 md:max-w-4xl pb-24 md:pb-6">
      <header className="mb-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-4 w-10 h-10 rounded-full bg-black/8 dark:bg-white/10 border border-slate-200 dark:border-white/10 flex items-center justify-center active:scale-90 transition-all"
        >
          <span className="material-symbols-outlined text-xl text-slate-700 dark:text-white">
            arrow_back
          </span>
        </button>
        <h1 className="text-2xl font-semibold text-text-dark dark:text-white">
          {t('favorites.title')}
        </h1>
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
            <Link
              to="/map"
              className="inline-block py-2 px-4 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {t('profile.exploreCta')}
            </Link>
          }
        />
      )}
      {!loading && !error && places.length > 0 && (
        <div className="space-y-6 md:grid md:grid-cols-2 md:gap-5 md:space-y-0">
          {places.map((place, idx) => (
            <Fragment key={place.place_code}>
              <div className="relative group/card">
                <PlaceCardUnified place={place} t={t} />
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
              {/* Ad after every 4th favorite */}
              {(idx + 1) % 4 === 0 && (
                <div className="col-span-full">
                  <AdBanner slot="favorites-feed" format="horizontal" className="my-2" />
                </div>
              )}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
