import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useI18n } from '@/app/providers';
import {
  getPlace,
  getPlaceReviews,
  addFavorite,
  removeFavorite,
  deleteReview,
  checkIn as doCheckIn_api,
} from '@/lib/api/client';
import type {
  PlaceDetail as PlaceDetailType,
  Review,
  PlaceTiming,
  PlaceSpecification,
} from '@/lib/types';
import { useAuth, useTheme } from '@/app/providers';
import { useAuthRequired } from '@/lib/hooks/useAuthRequired';
import { SharePlaceButton } from '@/components/places';
import PlaceOpeningHours from '@/components/places/PlaceOpeningHours';
import PlaceTimingsCarousel from '@/components/places/PlaceTimingsCarousel';
import PlaceSpecificationsGrid from '@/components/places/PlaceSpecificationsGrid';
import { crowdColorClass, formatDistance } from '@/lib/utils/place-utils';
import { getFullImageUrl } from '@/lib/utils/imageUtils';

function ReviewsSection({
  placeCode,
  reviews,
  averageRating,
  reviewCount,
  currentUserCode,
  onReviewsChange,
}: {
  placeCode: string;
  reviews: Review[];
  averageRating?: number;
  reviewCount?: number;
  currentUserCode?: string | null;
  onReviewsChange: () => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const displayReviews = expanded ? reviews : reviews.slice(0, 3);

  const handleDelete = async (reviewCode: string) => {
    if (!window.confirm(t('reviews.confirmDelete'))) return;
    setDeletingCode(reviewCode);
    try {
      await deleteReview(reviewCode);
      onReviewsChange();
    } catch {
      // ignore
    } finally {
      setDeletingCode(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1.5 h-6 bg-primary rounded-full"></div>
            <h2 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
              {t('placeDetail.reviews')}
            </h2>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-5xl font-bold text-slate-900 dark:text-white tracking-tighter">
              {averageRating?.toFixed(1) || '0.0'}
            </span>
            <div className="flex flex-col">
              <div className="flex text-amber-500">
                {[1, 2, 3, 4, 5].map((s) => (
                  <span
                    key={s}
                    className="material-symbols-outlined text-lg"
                    style={{
                      fontVariationSettings: `'FILL' ${s <= Math.round(averageRating || 0) ? 1 : 0}`,
                    }}
                  >
                    star
                  </span>
                ))}
              </div>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
                {reviewCount || 0} {t('placeDetail.feedbackItems')}
              </span>
            </div>
          </div>
        </div>

        <Link
          to={`/places/${placeCode}/review`}
          className="bg-primary hover:bg-blue-600 text-white text-[11px] font-bold uppercase tracking-widest px-8 py-3 rounded-2xl shadow-lg shadow-primary/20 transition-all active:scale-95 text-center"
        >
          {t('placeDetail.writeAReview')}
        </Link>
      </div>

      <div className="space-y-6">
        {displayReviews.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 dark:bg-dark-surface rounded-3xl border border-dashed border-slate-200 dark:border-dark-border">
            <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">
              rate_review
            </span>
            <p className="text-slate-400 font-medium">{t('places.noReviewsYet')}</p>
          </div>
        ) : (
          displayReviews.map((r) => (
            <div
              key={r.review_code}
              className="bg-slate-50 dark:bg-dark-surface p-6 rounded-3xl border border-slate-100 dark:border-dark-border group transition-all hover:bg-white dark:hover:bg-dark-surface hover:shadow-soft"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm uppercase">
                    {(r.display_name || '?').charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-tight">
                      {r.display_name || t('common.visitor')}
                    </h4>
                    <div className="flex text-amber-500 mt-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <span
                          key={s}
                          className="material-symbols-outlined text-[14px]"
                          style={{ fontVariationSettings: `'FILL' ${s <= r.rating ? 1 : 0}` }}
                        >
                          star
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    {r.created_at
                      ? new Date(r.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })
                      : ''}
                  </span>
                  {currentUserCode === r.user_code && (
                    <div className="flex items-center gap-1">
                      <Link
                        to={`/places/${placeCode}/review`}
                        state={{ edit: r }}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-primary transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">edit</span>
                      </Link>
                      <button
                        onClick={() => handleDelete(r.review_code)}
                        disabled={deletingCode === r.review_code}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {r.title && (
                <h5 className="font-bold text-slate-900 dark:text-white text-[15px] mb-2">
                  {r.title}
                </h5>
              )}
              {r.body && (
                <p className="text-slate-600 dark:text-slate-300 text-[14px] leading-relaxed">
                  {r.body}
                </p>
              )}

              {r.images && r.images.length > 0 && (
                <div className="flex gap-3 mt-5 overflow-x-auto no-scrollbar pb-1">
                  {r.images.map((img, i) => (
                    <div
                      key={i}
                      className="w-24 h-24 rounded-2xl overflow-hidden shadow-soft shrink-0 border border-slate-200/50"
                    >
                      <img
                        src={getFullImageUrl(img.url)}
                        alt=""
                        className="w-full h-full object-cover transition-transform hover:scale-110 duration-500"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {reviews.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full py-4 text-[11px] font-bold text-primary uppercase tracking-[0.2em] hover:bg-primary/5 rounded-2xl transition-all border border-dashed border-primary/20"
        >
          {expanded ? t('common.showLess') : t('places.viewAllReviews')}
        </button>
      )}
    </div>
  );
}

export default function PlaceDetail() {
  const { placeCode } = useParams<{ placeCode: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user } = useAuth();
  const { units } = useTheme();
  const { requireAuth } = useAuthRequired();

  const [place, setPlace] = useState<PlaceDetailType | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [averageRating, setAverageRating] = useState<number | undefined>();
  const [reviewCount, setReviewCount] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkInDone, setCheckInDone] = useState(false);
  const [checkInDate, setCheckInDate] = useState('');
  const [storyExpanded, setStoryExpanded] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(false);
  const [heroIdx, setHeroIdx] = useState(0);
  const [heroIsDragging, setHeroIsDragging] = useState(false);
  const [heroDragStartX, setHeroDragStartX] = useState(0);
  const heroDidDragRef = useRef(false);

  const heroImages = (place?.images ?? [])
    .map((img) => getFullImageUrl(img.url))
    .filter(Boolean) as string[];

  useEffect(() => {
    const handleScroll = () => {
      const show = window.scrollY > 200;
      if (show !== headerVisible) setHeaderVisible(show);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [headerVisible]);

  // Hero carousel auto-swipe
  useEffect(() => {
    if (heroImages.length <= 1) return;
    const id = setInterval(() => setHeroIdx((prev) => (prev + 1) % heroImages.length), 3000);
    return () => clearInterval(id);
  }, [heroImages.length]);

  const fetchPlace = useCallback(async () => {
    if (!placeCode) return;
    setLoading(true);
    setNotFound(false);
    setError('');
    try {
      const [placeData, reviewsData] = await Promise.all([
        getPlace(placeCode),
        getPlaceReviews(placeCode, 10),
      ]);
      setPlace(placeData);
      setCheckInDone(placeData.user_has_checked_in === true);
      setReviews(reviewsData.reviews ?? []);
      setAverageRating(reviewsData.average_rating);
      setReviewCount(reviewsData.review_count);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common.error');
      setError(msg);
      setPlace(null);
      setReviews([]);
      if (msg.toLowerCase().includes('not found') || msg === 'Place not found') setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [placeCode, t]);

  useEffect(() => {
    fetchPlace();
  }, [fetchPlace]);

  const doToggleFavorite = useCallback(async () => {
    if (!placeCode || !place) return;
    setFavoriteLoading(true);
    try {
      if (place.is_favorite) await removeFavorite(placeCode);
      else await addFavorite(placeCode);
      setPlace((p) => (p ? { ...p, is_favorite: !p.is_favorite } : null));
    } catch {
      // keep UI state
    } finally {
      setFavoriteLoading(false);
    }
  }, [placeCode, place]);

  const toggleFavorite = useCallback(() => {
    requireAuth(() => doToggleFavorite());
  }, [requireAuth, doToggleFavorite]);

  const doCheckIn = useCallback(async () => {
    if (!placeCode || checkInLoading || checkInDone) return;
    setCheckInLoading(true);
    try {
      const result = await doCheckIn_api(placeCode);
      const date = new Date(result.checked_in_at).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      setCheckInDate(date);
      setTimeout(() => setCheckInDone(true), 430);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Check-in failed. Please try again.');
    } finally {
      setCheckInLoading(false);
    }
  }, [placeCode, checkInLoading, checkInDone]);

  const handleCheckIn = useCallback(() => {
    if (checkInDone) return;
    requireAuth(() => doCheckIn(), 'visitor.loginRequired');
  }, [requireAuth, doCheckIn, checkInDone]);

  const checkInWidget = () => {
    if (checkInDone) {
      return (
        <div className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium text-sm">
          <span className="material-symbols-outlined text-lg">check_circle</span>
          <span className="truncate">
            {checkInDate
              ? t('places.checkedInDate').replace('{date}', checkInDate)
              : t('places.checkIn')}
          </span>
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={handleCheckIn}
        disabled={checkInLoading}
        className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary text-white font-medium text-sm hover:bg-primary-hover transition-all disabled:opacity-70"
      >
        {checkInLoading ? (
          <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
        ) : (
          <span className="material-symbols-outlined text-lg">location_on</span>
        )}
        {checkInLoading ? t('common.loading') : t('places.checkIn')}
      </button>
    );
  };

  if (!placeCode) {
    return (
      <div className="p-6 text-center text-text-muted dark:text-dark-text-secondary">
        <p>{t('places.missingCode')}</p>
        <button type="button" onClick={() => navigate('/home')} className="text-primary mt-2">
          {t('common.backToHome')}
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <p className="text-text-muted">{t('common.loading')}</p>
      </div>
    );
  }

  if (notFound || (!place && error)) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <span className="material-symbols-outlined text-5xl text-text-muted mb-4 block">
          location_off
        </span>
        <h1 className="text-xl font-semibold text-text-main dark:text-white mb-2">
          {t('places.notFound')}
        </h1>
        <p className="text-text-muted dark:text-dark-text-secondary mb-4">{error}</p>
        <button
          type="button"
          onClick={() => navigate('/home')}
          className="px-4 py-2 rounded-xl bg-primary text-white font-medium"
        >
          {t('common.backToHome')}
        </button>
      </div>
    );
  }

  if (!place) return null;

  const handleHeroMouseDown = (e: React.MouseEvent) => {
    setHeroIsDragging(true);
    setHeroDragStartX(e.clientX);
    heroDidDragRef.current = false;
  };
  const handleHeroMouseMove = (e: React.MouseEvent) => {
    if (!heroIsDragging) return;
    const diff = e.clientX - heroDragStartX;
    if (Math.abs(diff) >= 40) {
      setHeroIdx((prev) => (prev + (diff < 0 ? 1 : -1) + heroImages.length) % heroImages.length);
      setHeroDragStartX(e.clientX);
      heroDidDragRef.current = true;
    }
  };
  const handleHeroMouseUp = () => setHeroIsDragging(false);

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place.lat + ',' + place.lng)}`;

  const timings: PlaceTiming[] =
    (place as PlaceDetailType & { timings?: PlaceTiming[] }).timings ?? [];
  const specifications: PlaceSpecification[] =
    (place as PlaceDetailType & { specifications?: PlaceSpecification[] }).specifications ?? [];
  const crowdLevel: string | null =
    (place as PlaceDetailType & { crowd_level?: string }).crowd_level ?? null;
  const totalCheckins: number | null =
    (place as PlaceDetailType & { total_checkins_count?: number }).total_checkins_count ?? null;

  const carouselTitle =
    place.religion === 'islam'
      ? t('placeDetail.prayerTimes')
      : place.religion === 'hinduism'
        ? t('placeDetail.divinePresence')
        : t('placeDetail.serviceTimes');

  /* Shared sidebar content (used in desktop 2-col layout) */
  const SidebarActions = () => (
    <div className="space-y-3">
      {/* Score cards */}
      <div className="rounded-2xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-4">
        <div className="flex items-center divide-x divide-input-border dark:divide-dark-border">
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex flex-col items-center gap-1 px-2 hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-primary text-[22px]">directions</span>
            <span className="text-sm font-bold text-text-main dark:text-white">
              {place.distance != null ? formatDistance(place.distance, units) : '—'}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-text-muted dark:text-dark-text-secondary font-semibold">
              {t('placeDetail.distance')}
            </span>
          </a>
          <div className="flex-1 flex flex-col items-center gap-1 px-2">
            <span
              className={`material-symbols-outlined text-[22px] ${crowdColorClass(crowdLevel) || 'text-text-muted'}`}
            >
              people
            </span>
            <span
              className={`text-sm font-bold ${crowdColorClass(crowdLevel) || 'text-text-main dark:text-white'}`}
            >
              {crowdLevel ?? '—'}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-text-muted dark:text-dark-text-secondary font-semibold">
              {t('placeDetail.crowd')}
            </span>
          </div>
          <div className="flex-1 flex flex-col items-center gap-1 px-2">
            <span className="material-symbols-outlined text-primary text-[22px]">
              check_circle_outline
            </span>
            <span className="text-sm font-bold text-text-main dark:text-white">
              {totalCheckins != null ? totalCheckins : '—'}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-text-muted dark:text-dark-text-secondary font-semibold">
              {t('placeDetail.visits')}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-primary text-primary font-medium text-sm hover:bg-primary/5 transition-colors"
        >
          <span className="material-symbols-outlined text-lg">directions</span>
          {t('placeDetail.directions')}
        </a>
        {checkInWidget()}
      </div>
    </div>
  );

  return (
    <div className="w-full min-h-screen bg-background-light dark:bg-dark-bg">
      {/* Sticky Header (Fade in on scroll) */}
      <div
        className={`fixed top-0 left-0 right-0 z-[100] bg-white/95 backdrop-blur-xl border-b border-slate-100 dark:bg-dark-bg/95 dark:border-dark-border px-4 pt-14 pb-4 transition-all duration-500 transform ${headerVisible ? 'translate-y-0 opacity-100 shadow-xl shadow-black/5' : '-translate-y-full opacity-0 pointer-events-none'}`}
      >
        <div className="flex items-center gap-4 max-w-5xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 flex items-center justify-center rounded-2xl bg-slate-50 dark:bg-dark-surface text-slate-400 hover:text-primary transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-xl">arrow_back</span>
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-900 dark:text-white truncate text-lg leading-tight">
              {place.name}
            </h2>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
              <span
                className="material-symbols-outlined text-[14px] text-amber-500"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                star
              </span>
              {averageRating?.toFixed(1)}
              <span className="mx-1 opacity-30">•</span>
              {totalCheckins} check-ins
            </div>
          </div>
          <button
            onClick={toggleFavorite}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all active:scale-90 ${place.is_favorite ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-slate-50 dark:bg-dark-surface text-slate-400 hover:text-primary'}`}
          >
            <span
              className="material-symbols-outlined text-[20px]"
              style={{ fontVariationSettings: `'FILL' ${place.is_favorite ? 1 : 0}` }}
            >
              {place.is_favorite ? 'bookmark' : 'bookmark_border'}
            </span>
          </button>
        </div>
      </div>
      {/* Hero (fixed behind content) */}
      <div
        className="fixed top-0 left-0 right-0 h-[300px] md:h-[380px] w-full overflow-hidden bg-[#1a2e2e] z-0 select-none"
        onMouseDown={heroImages.length > 1 ? handleHeroMouseDown : undefined}
        onMouseMove={heroImages.length > 1 ? handleHeroMouseMove : undefined}
        onMouseUp={heroImages.length > 1 ? handleHeroMouseUp : undefined}
        style={{
          cursor: heroImages.length > 1 ? (heroIsDragging ? 'grabbing' : 'grab') : undefined,
        }}
      >
        {heroImages.length > 0 ? (
          <div
            className="flex h-full transition-transform duration-500 ease-in-out absolute inset-0"
            style={{
              transform: `translateX(-${heroIdx * (100 / heroImages.length)}%)`,
              width: `${heroImages.length * 100}%`,
            }}
          >
            {heroImages.map((src, i) => (
              <img
                key={i}
                src={src}
                alt=""
                className="h-full object-cover flex-shrink-0"
                style={{ width: `${100 / heroImages.length}%` }}
                draggable={false}
              />
            ))}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="material-symbols-outlined text-7xl text-white/30">location_city</span>
          </div>
        )}
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40 pointer-events-none" />

        {/* Dot indicators */}
        {heroImages.length > 1 && (
          <div className="absolute bottom-24 left-0 right-0 flex justify-center gap-1.5 z-10 pointer-events-none">
            {heroImages.map((_, i) => (
              <span
                key={i}
                className={`block rounded-full transition-all duration-300 ${
                  i === heroIdx ? 'w-5 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/50'
                }`}
              />
            ))}
          </div>
        )}

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-20 p-5 pt-14 flex justify-between items-center">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-11 h-11 rounded-full bg-black/35 flex items-center justify-center text-white hover:bg-black/50 transition-all border border-white/20"
            aria-label="Back"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="flex gap-2.5">
            <SharePlaceButton placeName={place.name} placeCode={place.place_code} variant="glass" />
            <button
              type="button"
              onClick={toggleFavorite}
              disabled={favoriteLoading}
              className="w-11 h-11 rounded-full bg-black/35 flex items-center justify-center text-white hover:bg-black/50 transition-all border border-white/20 disabled:opacity-50"
              aria-label={place.is_favorite ? t('places.unfavorite') : t('places.favorite')}
            >
              <span className="material-symbols-outlined">
                {place.is_favorite ? 'bookmark' : 'bookmark_border'}
              </span>
            </button>
          </div>
        </div>

        {/* Hero bottom info */}
        <div className="absolute bottom-0 left-0 right-0 p-6 pb-10 z-10">
          <div className="flex items-center gap-2 mb-2.5">
            {(() => {
              const status =
                place.open_status ??
                (place.is_open_now === true
                  ? 'open'
                  : place.is_open_now === false
                    ? 'closed'
                    : null);
              if (status === 'open')
                return (
                  <span className="badge-open-glass">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {t('places.open')}
                  </span>
                );
              if (status === 'closed')
                return (
                  <span className="badge-closed-glass">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    {t('places.closed')}
                  </span>
                );
              if (status === 'unknown')
                return <span className="badge-unknown-glass">{t('places.unknown')}</span>;
              return null;
            })()}
            {averageRating != null && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-black/25 border border-white/15 text-white">
                <span className="material-symbols-outlined text-amber-400 text-[14px]">star</span>
                {averageRating.toFixed(1)}
              </span>
            )}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-1.5 leading-tight tracking-tight drop-shadow-lg">
            {place.name}
          </h1>
          {place.address && (
            <p className="text-white/85 text-sm font-light flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">location_on</span>
              {place.address}
            </p>
          )}
        </div>
      </div>

      {/* Spacer to push content below fixed hero */}
      <div className="h-[300px] md:h-[380px]" aria-hidden="true" />

      {/* Main content */}
      <div className="relative max-w-5xl mx-auto">
        {/* Mobile layout */}
        <div className="lg:hidden">
          <div className="bg-background-light dark:bg-dark-bg rounded-t-[2rem] pt-6 pb-28 px-4 space-y-6">
            {/* Mobile scorecards */}
            <div className="flex items-center divide-x divide-input-border dark:divide-dark-border bg-white dark:bg-dark-surface rounded-2xl border border-input-border dark:border-dark-border shadow-sm py-4">
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex flex-col items-center gap-1 px-2 hover:text-primary"
              >
                <span className="material-symbols-outlined text-primary text-[22px]">
                  directions
                </span>
                <span className="text-sm font-bold text-text-main dark:text-white">
                  {place.distance != null ? formatDistance(place.distance, units) : '—'}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-text-muted dark:text-dark-text-secondary font-semibold">
                  {t('placeDetail.distance')}
                </span>
              </a>
              <div className="flex-1 flex flex-col items-center gap-1 px-2">
                <span
                  className={`material-symbols-outlined text-[22px] ${crowdColorClass(crowdLevel) || 'text-text-muted'}`}
                >
                  people
                </span>
                <span
                  className={`text-sm font-bold ${crowdColorClass(crowdLevel) || 'text-text-main dark:text-white'}`}
                >
                  {crowdLevel ?? '—'}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-text-muted dark:text-dark-text-secondary font-semibold">
                  {t('placeDetail.crowd')}
                </span>
              </div>
              <div className="flex-1 flex flex-col items-center gap-1 px-2">
                <span className="material-symbols-outlined text-primary text-[22px]">
                  check_circle_outline
                </span>
                <span className="text-sm font-bold text-text-main dark:text-white">
                  {totalCheckins != null ? totalCheckins : '—'}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-text-muted dark:text-dark-text-secondary font-semibold">
                  {t('placeDetail.visits')}
                </span>
              </div>
            </div>

            {/* The Story */}
            {place.description && (
              <section className="mb-12">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1.5 h-6 bg-primary rounded-full"></div>
                  <h2 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                    {t('placeDetail.theStory')}
                  </h2>
                </div>
                <div className="bg-white dark:bg-dark-surface rounded-[2rem] p-6 border border-slate-100 dark:border-dark-border shadow-soft">
                  <p
                    className={`text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed ${storyExpanded ? '' : 'line-clamp-5'}`}
                  >
                    {place.description}
                  </p>
                  <button
                    type="button"
                    onClick={() => setStoryExpanded((v) => !v)}
                    className="mt-4 text-sm font-bold text-primary hover:text-primary-hover flex items-center gap-1"
                  >
                    {storyExpanded ? t('common.showLess') : t('common.showMore')}
                    <span className="material-symbols-outlined text-sm">
                      {storyExpanded ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>
                </div>
              </section>
            )}

            {/* Opening Hours */}
            {place.opening_hours && Object.keys(place.opening_hours).length > 0 && (
              <PlaceOpeningHours
                opening_hours={place.opening_hours}
                opening_hours_today={place.opening_hours_today}
                t={t}
                compact
              />
            )}

            {/* Carousel */}
            {timings.length > 0 && (
              <PlaceTimingsCarousel timings={timings} title={carouselTitle} compact />
            )}

            {/* Specifications */}
            {specifications.length > 0 && (
              <PlaceSpecificationsGrid specifications={specifications} t={t} compact />
            )}

            {/* Reviews */}
            <section>
              <ReviewsSection
                placeCode={place.place_code}
                reviews={reviews}
                averageRating={averageRating}
                reviewCount={reviewCount}
                currentUserCode={user?.user_code}
                onReviewsChange={fetchPlace}
              />
            </section>
          </div>

          {/* Mobile sticky footer */}
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl dark:bg-dark-bg/95 border-t border-slate-100 dark:border-dark-border px-6 py-4 flex gap-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] animate-in slide-in-from-bottom-full duration-500 lg:hidden">
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-50 dark:bg-dark-surface text-slate-400 hover:text-primary transition-all active:scale-95 border border-slate-100 dark:border-dark-border"
              title={t('placeDetail.directions')}
            >
              <span className="material-symbols-outlined text-2xl">directions</span>
            </a>
            {checkInWidget()}
          </div>
        </div>

        {/* Desktop 2-column layout */}
        <div className="hidden lg:grid lg:grid-cols-[1fr_360px] lg:gap-8 lg:items-start bg-background-light dark:bg-dark-bg rounded-t-[2rem] pt-8 pb-16 px-8">
          {/* Left column: main content */}
          <div className="space-y-8">
            {/* The Story */}
            {place.description && (
              <section className="mb-12">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1.5 h-6 bg-primary rounded-full"></div>
                  <h2 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                    {t('placeDetail.theStory')}
                  </h2>
                </div>
                <div className="bg-white dark:bg-dark-surface rounded-[2rem] p-8 border border-slate-100 dark:border-dark-border shadow-soft">
                  <p
                    className={`text-lg text-slate-600 dark:text-slate-300 leading-relaxed ${storyExpanded ? '' : 'line-clamp-6'}`}
                  >
                    {place.description}
                  </p>
                  <button
                    type="button"
                    onClick={() => setStoryExpanded((v) => !v)}
                    className="mt-6 text-sm font-bold text-primary hover:text-primary-hover flex items-center gap-2 transition-all hover:gap-3"
                  >
                    {storyExpanded ? t('common.showLess') : t('common.readMore')}
                    <span className="material-symbols-outlined text-base">
                      {storyExpanded ? 'expand_less' : 'east'}
                    </span>
                  </button>
                </div>
              </section>
            )}

            {/* Opening Hours */}
            {place.opening_hours && Object.keys(place.opening_hours).length > 0 && (
              <PlaceOpeningHours
                opening_hours={place.opening_hours}
                opening_hours_today={place.opening_hours_today}
                t={t}
              />
            )}

            {/* Carousel */}
            {timings.length > 0 && <PlaceTimingsCarousel timings={timings} title={carouselTitle} />}

            {/* Specifications */}
            {specifications.length > 0 && (
              <PlaceSpecificationsGrid specifications={specifications} t={t} />
            )}

            {/* Reviews */}
            <section>
              <ReviewsSection
                placeCode={place.place_code}
                reviews={reviews}
                averageRating={averageRating}
                reviewCount={reviewCount}
                currentUserCode={user?.user_code}
                onReviewsChange={fetchPlace}
              />
            </section>
          </div>

          {/* Right column: sticky sidebar */}
          <div className="sticky top-6 space-y-4">
            <SidebarActions />
          </div>
        </div>
      </div>
    </div>
  );
}
