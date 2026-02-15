import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useI18n } from '@/app/providers';
import {
  getPlace,
  getPlaceReviews,
  addFavorite,
  removeFavorite,
  deleteReview,
  checkIn as doCheckIn,
} from '@/lib/api/client';
import { shareUrl } from '@/lib/share';
import type { PlaceDetail as PlaceDetailType, Review, PlaceTiming, PlaceSpecification } from '@/lib/types';
import { useAuth } from '@/app/providers';

function SharePlaceButton({
  placeName,
  placeCode,
  variant = 'default',
}: {
  placeName: string;
  placeCode: string;
  variant?: 'default' | 'glass';
}) {
  const [status, setStatus] = useState<'idle' | 'shared' | 'copied'>('idle');
  const handleShare = async () => {
    const result = await shareUrl(placeName, `/places/${placeCode}`);
    setStatus(result === 'shared' ? 'shared' : 'copied');
    setTimeout(() => setStatus('idle'), 2000);
  };
  if (variant === 'glass') {
    return (
      <button
        type="button"
        onClick={handleShare}
        className="w-11 h-11 rounded-full bg-black/35 flex items-center justify-center text-white hover:bg-black/50 transition-all border border-white/20"
        aria-label="Share"
        title={status !== 'idle' ? (status === 'copied' ? 'Link copied' : 'Shared') : 'Share'}
      >
        <span className="material-symbols-outlined text-[20px]">share</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={handleShare}
      className="p-3 rounded-xl border border-input-border text-text-main hover:bg-gray-50"
      aria-label="Share"
      title={status !== 'idle' ? (status === 'copied' ? 'Link copied' : 'Shared') : 'Share'}
    >
      <span className="material-symbols-outlined">share</span>
    </button>
  );
}

function crowdColorClass(level?: string | null) {
  if (!level) return '';
  const l = level.toLowerCase();
  if (l === 'low') return 'text-emerald-600';
  if (l === 'medium') return 'text-amber-600';
  if (l === 'high') return 'text-red-600';
  return '';
}

function TimingCircle({ item }: { item: PlaceTiming }) {
  const isCurrent = item.status === 'current';
  const isPast = item.status === 'past';
  return (
    <div className="flex flex-col items-center gap-2 min-w-[84px] group">
      <div
        className={`w-[80px] h-[80px] rounded-full border-2 flex flex-col items-center justify-center p-1 transition-all duration-300 transform group-hover:scale-105 active:scale-95 relative ${isCurrent
            ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20'
            : isPast
              ? 'border-slate-100 bg-white opacity-60'
              : 'border-slate-200 bg-white shadow-soft'
          }`}
      >
        <span
          className={`text-[10px] font-bold uppercase tracking-tighter leading-tight text-center ${isCurrent ? 'text-primary' : isPast ? 'text-text-muted' : 'text-text-secondary'
            }`}
        >
          {item.name}
        </span>
        {item.time && (
          <span
            className={`text-[14px] font-black leading-tight text-center mt-0.5 ${isCurrent ? 'text-primary' : isPast ? 'text-text-muted' : 'text-text-main'
              }`}
          >
            {item.time}
          </span>
        )}
        {isCurrent && (
          <div className="absolute -bottom-1 w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-white shadow-lg" />
        )}
        {isPast && (
          <span className="material-symbols-outlined text-[12px] text-text-muted mt-0.5">check</span>
        )}
      </div>
      {item.subtitle ? (
        <span className="text-[10px] text-text-muted font-bold uppercase tracking-widest text-center mt-1 scale-90">{item.subtitle}</span>
      ) : null}
    </div>
  );
}

function DeityCircle({ item }: { item: PlaceTiming }) {
  return (
    <div className="flex flex-col items-center gap-2 min-w-[84px] group">
      <div className="w-[80px] h-[80px] rounded-full border-2 border-amber-200/60 bg-white overflow-hidden flex items-center justify-center transition-all duration-300 transform group-hover:scale-105 shadow-soft">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-4xl">🛕</span>
        )}
      </div>
      <span className="text-[12px] font-bold text-text-main text-center leading-tight mt-1">{item.name}</span>
      {item.subtitle ? (
        <span className="text-[10px] text-text-muted font-bold uppercase tracking-widest text-center scale-90">{item.subtitle}</span>
      ) : null}
    </div>
  );
}

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
  const userReview = currentUserCode ? reviews.find((r) => r.user_code === currentUserCode) : null;

  const handleDelete = async (reviewCode: string) => {
    if (!window.confirm('Delete this review?')) return;
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
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-text-main">{t('placeDetail.recentReviews')}</h2>
        {(averageRating != null || (reviewCount != null && reviewCount > 0)) && (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="material-symbols-outlined text-amber-500 text-lg">star</span>
            <span className="font-bold text-text-main">{averageRating?.toFixed(1) ?? '—'}</span>
            <span className="text-text-muted">({reviewCount ?? 0})</span>
          </div>
        )}
      </div>

      {userReview ? (
        <Link
          to={`/places/${placeCode}/review`}
          state={{ edit: userReview }}
          className="inline-flex items-center gap-2 text-primary font-medium text-sm mb-4 hover:text-primary-hover"
        >
          <span className="material-symbols-outlined text-lg">edit</span>
          Edit your review
        </Link>
      ) : (
        <Link
          to={`/places/${placeCode}/review`}
          className="inline-flex items-center gap-2 text-primary font-medium text-sm mb-4 hover:text-primary-hover"
        >
          <span className="material-symbols-outlined text-lg">edit_square</span>
          {t('places.writeReview')}
        </Link>
      )}

      {reviews.length === 0 ? (
        <p className="text-text-muted text-sm py-3">{t('places.noReviewsYet')}</p>
      ) : (
        <div className="space-y-3">
          {displayReviews.map((r) => (
            <div key={r.review_code} className="rounded-xl border border-input-border bg-white p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                  {(r.display_name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-text-main text-sm">{r.display_name || 'Visitor'}</p>
                  <p className="text-xs text-text-muted">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 text-amber-500 shrink-0">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <span key={i} className="material-symbols-outlined text-[16px]">
                      {i <= r.rating ? 'star' : 'star_border'}
                    </span>
                  ))}
                  {currentUserCode && r.user_code === currentUserCode && (
                    <div className="flex items-center gap-1 ml-2">
                      <Link
                        to={`/places/${placeCode}/review`}
                        state={{ edit: r }}
                        className="p-1 rounded text-text-muted hover:text-primary"
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(r.review_code)}
                        disabled={deletingCode === r.review_code}
                        className="p-1 rounded text-text-muted hover:text-red-600 disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {r.title && <p className="font-semibold text-text-main text-sm mb-1">{r.title}</p>}
              {r.body && <p className="text-sm text-text-secondary">{r.body}</p>}
            </div>
          ))}
          {reviews.length > 3 && !expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-primary font-medium text-sm hover:text-primary-hover"
            >
              {t('places.viewAllReviews')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function PlaceDetail() {
  const { placeCode } = useParams<{ placeCode: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user } = useAuth();

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

  useEffect(() => {
    const handleScroll = () => {
      const show = window.scrollY > 200;
      if (show !== headerVisible) setHeaderVisible(show);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [headerVisible]);

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

  const toggleFavorite = useCallback(async () => {
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

  const handleCheckIn = useCallback(async () => {
    if (!placeCode || checkInLoading || checkInDone) return;
    setCheckInLoading(true);
    try {
      const result = await doCheckIn(placeCode);
      const date = new Date(result.checked_in_at).toLocaleDateString('en-US', {
        day: 'numeric', month: 'short', year: 'numeric',
      });
      setCheckInDate(date);
      setTimeout(() => setCheckInDone(true), 430);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Check-in failed. Please try again.');
    } finally {
      setCheckInLoading(false);
    }
  }, [placeCode, checkInLoading, checkInDone]);

  const checkInWidget = () => {
    if (checkInDone) {
      return (
        <div className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium text-sm">
          <span className="material-symbols-outlined text-lg">check_circle</span>
          <span className="truncate">{checkInDate ? `Checked in ${checkInDate}` : 'Checked in'}</span>
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
      <div className="p-6 text-center text-text-muted">
        <p>Missing place code.</p>
        <button type="button" onClick={() => navigate('/home')} className="text-primary mt-2">
          Back to Home
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
        <span className="material-symbols-outlined text-5xl text-text-muted mb-4 block">location_off</span>
        <h1 className="text-xl font-semibold text-text-main mb-2">Place not found</h1>
        <p className="text-text-muted mb-4">{error}</p>
        <button
          type="button"
          onClick={() => navigate('/home')}
          className="px-4 py-2 rounded-xl bg-primary text-white font-medium"
        >
          Back to Home
        </button>
      </div>
    );
  }

  if (!place) return null;

  const heroImage = place.image_urls?.[0] ?? '';
  const formatDist = (km: number) => km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place.lat + ',' + place.lng)}`;

  const timings: PlaceTiming[] = (place as PlaceDetailType & { timings?: PlaceTiming[] }).timings ?? [];
  const specifications: PlaceSpecification[] = (place as PlaceDetailType & { specifications?: PlaceSpecification[] }).specifications ?? [];
  const crowdLevel: string | null = (place as PlaceDetailType & { crowd_level?: string }).crowd_level ?? null;
  const totalCheckins: number | null = (place as PlaceDetailType & { total_checkins_count?: number }).total_checkins_count ?? null;

  const carouselTitle =
    place.religion === 'islam' ? t('placeDetail.prayerTimes') :
      place.religion === 'hinduism' ? t('placeDetail.divinePresence') :
        t('placeDetail.serviceTimes');

  const renderTimingItem = (item: PlaceTiming, i: number) => {
    if (item.type === 'deity') return <DeityCircle key={i} item={item} />;
    return <TimingCircle key={i} item={item} />;
  };

  /* Shared sidebar content (used in desktop 2-col layout) */
  const SidebarActions = () => (
    <div className="space-y-3">
      {/* Score cards */}
      <div className="rounded-2xl border border-input-border bg-white p-4">
        <div className="flex items-center divide-x divide-input-border">
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex flex-col items-center gap-1 px-2 hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-primary text-[22px]">directions</span>
            <span className="text-sm font-bold text-text-main">
              {place.distance != null ? formatDist(place.distance) : '—'}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-text-muted font-semibold">
              {t('placeDetail.distance')}
            </span>
          </a>
          <div className="flex-1 flex flex-col items-center gap-1 px-2">
            <span className={`material-symbols-outlined text-[22px] ${crowdColorClass(crowdLevel) || 'text-text-muted'}`}>people</span>
            <span className={`text-sm font-bold ${crowdColorClass(crowdLevel) || 'text-text-main'}`}>
              {crowdLevel ?? '—'}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-text-muted font-semibold">
              {t('placeDetail.crowd')}
            </span>
          </div>
          <div className="flex-1 flex flex-col items-center gap-1 px-2">
            <span className="material-symbols-outlined text-primary text-[22px]">check_circle_outline</span>
            <span className="text-sm font-bold text-text-main">
              {totalCheckins != null ? totalCheckins : '—'}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-text-muted font-semibold">
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
    <div className="w-full min-h-screen bg-background-light">
      {/* Sticky Header (Fade in on scroll) */}
      <div className={`fixed top-0 left-0 right-0 z-[100] bg-white/90 backdrop-blur-xl border-b border-white/20 px-4 pt-14 pb-4 transition-all duration-300 transform ${headerVisible ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-4 max-w-5xl mx-auto">
          <button onClick={() => navigate(-1)} className="p-1 rounded-full text-slate-400 hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-2xl">arrow_back</span>
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-800 truncate">{place.name}</h2>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span className="material-symbols-outlined text-[14px] text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
              {averageRating?.toFixed(1)}
              <span className="mx-1 opacity-30">•</span>
              {totalCheckins} check-ins
            </div>
          </div>
          <button onClick={toggleFavorite} className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${place.is_favorite ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400'}`}>
            <span className="material-symbols-outlined text-[20px]">{place.is_favorite ? 'bookmark' : 'bookmark_border'}</span>
          </button>
        </div>
      </div>
      {/* Hero (fixed behind content) */}
      <div className="fixed top-0 left-0 right-0 h-[300px] md:h-[380px] w-full overflow-hidden bg-[#1a2e2e] z-0">
        {heroImage ? (
          <img
            src={heroImage}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="material-symbols-outlined text-7xl text-white/30">location_city</span>
          </div>
        )}
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />

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
            {place.is_open_now != null && (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide border ${place.is_open_now
                  ? 'bg-emerald-500/30 border-emerald-400/40 text-white'
                  : 'bg-red-500/30 border-red-400/40 text-white'
                  }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${place.is_open_now ? 'bg-emerald-400' : 'bg-red-400'}`}
                />
                {place.is_open_now ? t('places.openNow') : t('places.closed')}
              </span>
            )}
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
      <div className="relative z-10 -mt-8 max-w-5xl mx-auto">
        {/* Mobile layout */}
        <div className="lg:hidden">
          <div className="bg-background-light rounded-t-[2rem] pt-6 pb-28 px-4 space-y-6">
            {/* Mobile scorecards */}
            <div className="flex items-center divide-x divide-input-border bg-white rounded-2xl border border-input-border shadow-sm py-4">
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex flex-col items-center gap-1 px-2 hover:text-primary"
              >
                <span className="material-symbols-outlined text-primary text-[22px]">directions</span>
                <span className="text-sm font-bold text-text-main">
                  {place.distance != null ? formatDist(place.distance) : '—'}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-text-muted font-semibold">
                  {t('placeDetail.distance')}
                </span>
              </a>
              <div className="flex-1 flex flex-col items-center gap-1 px-2">
                <span className={`material-symbols-outlined text-[22px] ${crowdColorClass(crowdLevel) || 'text-text-muted'}`}>people</span>
                <span className={`text-sm font-bold ${crowdColorClass(crowdLevel) || 'text-text-main'}`}>
                  {crowdLevel ?? '—'}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-text-muted font-semibold">
                  {t('placeDetail.crowd')}
                </span>
              </div>
              <div className="flex-1 flex flex-col items-center gap-1 px-2">
                <span className="material-symbols-outlined text-primary text-[22px]">check_circle_outline</span>
                <span className="text-sm font-bold text-text-main">
                  {totalCheckins != null ? totalCheckins : '—'}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-text-muted font-semibold">
                  {t('placeDetail.visits')}
                </span>
              </div>
            </div>

            {/* The Story */}
            {place.description && (
              <section>
                <h2 className="text-lg font-bold text-text-main mb-3">{t('placeDetail.theStory')}</h2>
                <p className={`text-[15px] text-text-secondary leading-relaxed ${storyExpanded ? '' : 'line-clamp-5'}`}>
                  {place.description}
                </p>
                <button
                  type="button"
                  onClick={() => setStoryExpanded((v) => !v)}
                  className="mt-2 text-sm font-semibold text-primary hover:text-primary-hover"
                >
                  {storyExpanded ? t('common.readLess') : t('common.readMore')}
                </button>
              </section>
            )}

            {/* Carousel */}
            {timings.length > 0 && (
              <section>
                <h2 className="text-lg font-bold text-text-main mb-3">{carouselTitle}</h2>
                <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                  {timings.map((item, i) => renderTimingItem(item, i))}
                </div>
              </section>
            )}

            {/* Specifications */}
            {specifications.length > 0 && (
              <section>
                <h2 className="text-lg font-bold text-text-main mb-3">{t('placeDetail.detailsAndFacilities')}</h2>
                <div className="grid grid-cols-2 gap-3">
                  {specifications.map((spec, i) => (
                    <div key={i} className="p-4 rounded-2xl bg-white border border-input-border shadow-sm flex flex-col gap-2">
                      <span className="material-symbols-outlined text-primary text-[22px]">{spec.icon}</span>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{t(spec.label)}</p>
                      <p className="text-sm font-semibold text-text-main">{spec.value}</p>
                    </div>
                  ))}
                </div>
              </section>
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
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-input-border px-4 py-3 flex gap-2 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-[1.5px] border-primary text-primary font-medium text-sm hover:bg-primary/5 transition-colors"
            >
              <span className="material-symbols-outlined text-lg">directions</span>
              {t('placeDetail.directions')}
            </a>
            {checkInWidget()}
          </div>
        </div>

        {/* Desktop 2-column layout */}
        <div className="hidden lg:grid lg:grid-cols-[1fr_360px] lg:gap-8 lg:items-start bg-background-light rounded-t-[2rem] pt-8 pb-16 px-8">
          {/* Left column: main content */}
          <div className="space-y-8">
            {/* The Story */}
            {place.description && (
              <section>
                <h2 className="text-xl font-bold text-text-main mb-4">{t('placeDetail.theStory')}</h2>
                <p className={`text-[15px] text-text-secondary leading-relaxed ${storyExpanded ? '' : 'line-clamp-5'}`}>
                  {place.description}
                </p>
                <button
                  type="button"
                  onClick={() => setStoryExpanded((v) => !v)}
                  className="mt-2 text-sm font-semibold text-primary hover:text-primary-hover"
                >
                  {storyExpanded ? t('common.readLess') : t('common.readMore')}
                </button>
              </section>
            )}

            {/* Carousel */}
            {timings.length > 0 && (
              <section>
                <h2 className="text-xl font-bold text-text-main mb-4">{carouselTitle}</h2>
                <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2">
                  {timings.map((item, i) => renderTimingItem(item, i))}
                </div>
              </section>
            )}

            {/* Specifications */}
            {specifications.length > 0 && (
              <section>
                <h2 className="text-xl font-bold text-text-main mb-4">{t('placeDetail.detailsAndFacilities')}</h2>
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                  {specifications.map((spec, i) => (
                    <div key={i} className="p-5 rounded-2xl bg-white border border-input-border shadow-sm flex flex-col gap-2">
                      <span className="material-symbols-outlined text-primary text-[24px]">{spec.icon}</span>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{t(spec.label)}</p>
                      <p className="text-sm font-semibold text-text-main">{spec.value}</p>
                    </div>
                  ))}
                </div>
              </section>
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
