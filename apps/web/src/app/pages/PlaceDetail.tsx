import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useI18n } from '@/app/providers';
import {
  getPlace,
  getPlaceReviews,
  addFavorite,
  removeFavorite,
  deleteReview,
} from '@/lib/api/client';
import { shareUrl } from '@/lib/share';
import type { PlaceDetail as PlaceDetailType, Review, Religion } from '@/lib/types';
import { useAuth } from '@/app/providers';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function SharePlaceButton({ placeName, placeCode }: { placeName: string; placeCode: string }) {
  const [status, setStatus] = useState<'idle' | 'shared' | 'copied'>('idle');
  const handleShare = async () => {
    const result = await shareUrl(placeName, `/places/${placeCode}`);
    setStatus(result === 'shared' ? 'shared' : 'copied');
    setTimeout(() => setStatus('idle'), 2000);
  };
  return (
    <button
      type="button"
      onClick={handleShare}
      className="p-3 rounded-xl border border-input-border text-text-main hover:bg-gray-50 dark:hover:bg-gray-800"
      aria-label="Share"
      title={status !== 'idle' ? (status === 'copied' ? 'Link copied' : 'Shared') : 'Share'}
    >
      <span className="material-symbols-outlined">share</span>
    </button>
  );
}

function formatDayLabel(day: string): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

function OpeningTimes({ openingHours }: { openingHours: Record<string, string> }) {
  const entries = Object.entries(openingHours).filter(([, v]) => v != null && String(v).trim() !== '');
  if (entries.length === 0) return null;
  const todayKey = new Date().toLocaleDateString('en-GB', { weekday: 'long' }).toLowerCase();
  const lowerMap: Record<string, string> = {};
  Object.entries(openingHours).forEach(([k, v]) => {
    lowerMap[k.toLowerCase()] = v;
  });
  const todayHours = lowerMap[todayKey] ?? openingHours[todayKey] ?? openingHours[formatDayLabel(todayKey)] ?? '';

  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold text-text-main mb-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary">schedule</span>
        Opening times
      </h2>
      <div className="rounded-xl border border-input-border bg-gray-50 dark:bg-gray-800/50 p-4">
        {todayHours && (
          <p className="mb-2">
            <span className="font-medium text-text-main">Today</span>
            <span className="text-text-muted ml-2">{todayHours}</span>
          </p>
        )}
        <div className="space-y-1 text-sm">
          {DAY_ORDER.filter((d) => lowerMap[d] || openingHours[d]).map((day) => (
            <div key={day} className="flex justify-between text-text-muted">
              <span>{formatDayLabel(day)}</span>
              <span>{lowerMap[day] ?? openingHours[day] ?? ''}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ReligionSpecificSection({
  religion,
  religionSpecific,
}: {
  religion: Religion;
  religionSpecific?: Record<string, unknown>;
}) {
  const rs = religionSpecific ?? {};
  const safeStr = (v: unknown) => (v != null ? String(v) : '');
  const safeNum = (v: unknown) => (typeof v === 'number' ? v : null);
  const safeArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

  if (religion === 'hinduism') {
    const deities = safeArr(rs.deities) as { name?: string; image_url?: string }[];
    const festivalDates = safeArr(rs.festival_dates).map(safeStr).filter(Boolean);
    const dressCode = safeStr(rs.dress_code);
    const architecture = safeStr(rs.architecture);
    const nextFestival = safeStr(rs.next_festival);
    if (!deities.length && !festivalDates.length && !dressCode && !architecture && !nextFestival) return null;
    return (
      <section className="mb-6">
        <h2 className="text-lg font-semibold text-text-main mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">temple</span>
          Temple info
        </h2>
        <div className="rounded-xl border border-input-border bg-gray-50 dark:bg-gray-800/50 p-4 space-y-3 text-sm text-text-main dark:text-gray-200">
          {deities.length > 0 && (
            <div>
              <p className="font-medium text-text-muted mb-2">Main deities</p>
              <div className="flex flex-wrap gap-2">
                {deities.map((d, i) => (
                  <div
                    key={i}
                    className="px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-input-border"
                  >
                    {d.name ?? 'Deity'}
                  </div>
                ))}
              </div>
            </div>
          )}
          {architecture && <p><span className="text-text-muted">Architecture:</span> {architecture}</p>}
          {nextFestival && <p><span className="text-text-muted">Next festival:</span> {nextFestival}</p>}
          {dressCode && <p><span className="text-text-muted">Dress code:</span> {dressCode}</p>}
          {festivalDates.length > 0 && (
            <p><span className="text-text-muted">Festivals:</span> {festivalDates.join(', ')}</p>
          )}
        </div>
      </section>
    );
  }

  if (religion === 'islam') {
    const prayerTimes = (rs.prayer_times as Record<string, string>) ?? {};
    const capacity = safeNum(rs.capacity);
    const facilities = safeArr(rs.facilities).map(safeStr).filter(Boolean);
    const prayerEntries = Object.entries(prayerTimes).filter(([, v]) => v);
    if (!prayerEntries.length && capacity == null && facilities.length === 0) return null;
    return (
      <section className="mb-6">
        <h2 className="text-lg font-semibold text-text-main mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">mosque</span>
          Mosque info
        </h2>
        <div className="rounded-xl border border-input-border bg-gray-50 dark:bg-gray-800/50 p-4 space-y-3 text-sm text-text-main dark:text-gray-200">
          {prayerEntries.length > 0 && (
            <div>
              <p className="font-medium text-text-muted mb-2">Prayer times</p>
              <div className="grid grid-cols-2 gap-2">
                {prayerEntries.map(([name, time]) => (
                  <div key={name} className="flex justify-between">
                    <span className="capitalize text-text-muted">{name}</span>
                    <span>{time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {capacity != null && <p><span className="text-text-muted">Capacity:</span> {capacity}</p>}
          {facilities.length > 0 && (
            <p><span className="text-text-muted">Facilities:</span> {facilities.join(', ')}</p>
          )}
        </div>
      </section>
    );
  }

  if (religion === 'christianity') {
    const denomination = safeStr(rs.denomination);
    const serviceTimes = (rs.service_times as Record<string, string>) ?? {};
    const notableFeatures = safeArr(rs.notable_features).map(safeStr).filter(Boolean);
    const serviceEntries = Object.entries(serviceTimes).filter(([, v]) => v);
    if (!denomination && !serviceEntries.length && notableFeatures.length === 0) return null;
    return (
      <section className="mb-6">
        <h2 className="text-lg font-semibold text-text-main mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">church</span>
          Church info
        </h2>
        <div className="rounded-xl border border-input-border bg-gray-50 dark:bg-gray-800/50 p-4 space-y-3 text-sm text-text-main dark:text-gray-200">
          {denomination && <p><span className="text-text-muted">Denomination:</span> {denomination}</p>}
          {serviceEntries.length > 0 && (
            <div>
              <p className="font-medium text-text-muted mb-2">Service times</p>
              <div className="space-y-1">
                {serviceEntries.map(([day, time]) => (
                  <div key={day} className="flex justify-between">
                    <span className="text-text-muted">{day}</span>
                    <span>{time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {notableFeatures.length > 0 && (
            <p><span className="text-text-muted">Notable features:</span> {notableFeatures.join(', ')}</p>
          )}
        </div>
      </section>
    );
  }

  return null;
}

function ReviewsPreview({
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
  const hasMore = reviews.length > 3;
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
    <section className="mb-24">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-text-main flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">rate_review</span>
          {t('places.reviews')}
        </h2>
        {(averageRating != null || (reviewCount != null && reviewCount > 0)) && (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            {averageRating != null && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-amber-500 text-lg">star</span>
                {averageRating.toFixed(1)}
              </span>
            )}
            {reviewCount != null && reviewCount > 0 && (
              <span>({reviewCount} {reviewCount === 1 ? 'review' : 'reviews'})</span>
            )}
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
        <p className="text-text-muted text-sm py-4">{t('places.noReviewsYet')}</p>
      ) : (
        <div className="space-y-4">
          {displayReviews.map((r) => (
            <div
              key={r.review_code}
              className="rounded-xl border border-input-border bg-white dark:bg-gray-800 p-4"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold">
                  {(r.display_name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text-main">{r.display_name || 'Visitor'}</p>
                  <p className="text-xs text-text-muted">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-0.5 text-amber-500">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <span key={i} className="material-symbols-outlined text-lg">
                        {i <= r.rating ? 'star' : 'star_border'}
                      </span>
                    ))}
                  </div>
                  {currentUserCode && r.user_code === currentUserCode && (
                    <div className="flex items-center gap-1 ml-2">
                      <Link
                        to={`/places/${placeCode}/review`}
                        state={{ edit: r }}
                        className="p-1.5 rounded-lg text-text-muted hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-primary"
                        aria-label="Edit review"
                      >
                        <span className="material-symbols-outlined text-lg">edit</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(r.review_code)}
                        disabled={deletingCode === r.review_code}
                        className="p-1.5 rounded-lg text-text-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        aria-label="Delete review"
                      >
                        <span className="material-symbols-outlined text-lg">delete</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {r.title && <p className="font-medium text-text-main text-sm mb-1">{r.title}</p>}
              {(r.body != null && r.body !== '') && <p className="text-sm text-text-muted">{r.body}</p>}
            </div>
          ))}
          {hasMore && !expanded && (
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
    </section>
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

  const directionsUrl = place
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place.lat + ',' + place.lng)}`
    : '#';

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

  return (
    <div className="pb-32 max-w-2xl mx-auto">
      <div className="relative h-56 md:h-72 overflow-hidden bg-gray-200 dark:bg-gray-700">
        {heroImage ? (
          <img src={heroImage} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="material-symbols-outlined text-6xl text-text-muted">explore</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white hover:bg-black/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          aria-label="Back"
        >
          <span className="material-symbols-outlined" aria-hidden>arrow_back</span>
        </button>
        <div className="absolute bottom-4 left-4 right-4">
          <h1 className="text-2xl font-bold text-white drop-shadow-lg">{place.name}</h1>
          {place.distance != null && (
            <p className="text-white/90 text-sm mt-1">
              {place.distance < 1 ? `${Math.round(place.distance * 1000)} m away` : `${place.distance.toFixed(1)} km away`}
            </p>
          )}
        </div>
      </div>

      <div className="px-4 -mt-2 relative z-10">
        {place.opening_hours && Object.keys(place.opening_hours).length > 0 && (
          <OpeningTimes openingHours={place.opening_hours} />
        )}

        {place.description && (
          <section className="mb-6">
            <h2 className="text-lg font-semibold text-text-main mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">info</span>
              About
            </h2>
            <p className="text-text-muted text-sm leading-relaxed">{place.description}</p>
          </section>
        )}

        {place.address && (
          <section className="mb-6">
            <h2 className="text-lg font-semibold text-text-main mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">location_on</span>
              Address
            </h2>
            <p className="text-text-muted text-sm">{place.address}</p>
          </section>
        )}

        <ReligionSpecificSection religion={place.religion} religionSpecific={place.religion_specific} />

        <ReviewsPreview
          placeCode={place.place_code}
          reviews={reviews}
          averageRating={averageRating}
          reviewCount={reviewCount}
          currentUserCode={user?.user_code}
          onReviewsChange={fetchPlace}
        />
      </div>

      <div className="fixed bottom-0 left-0 right-0 safe-area-bottom bg-white dark:bg-gray-900 border-t border-input-border px-4 py-3 flex items-center gap-2 max-w-2xl mx-auto shadow-[0_-4px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_12px_rgba(0,0,0,0.3)]">
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-input-border text-text-main hover:bg-gray-50 dark:hover:bg-gray-800 font-medium text-sm"
        >
          <span className="material-symbols-outlined text-lg">directions</span>
          Get Directions
        </a>
        <Link
          to={`/places/${place.place_code}/check-in`}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white hover:bg-primary-hover font-medium text-sm"
        >
          <span className="material-symbols-outlined text-lg">check_circle</span>
          {t('places.checkIn')}
        </Link>
        <SharePlaceButton placeName={place.name} placeCode={place.place_code} />
        <button
          type="button"
          onClick={toggleFavorite}
          disabled={favoriteLoading}
          className="p-3 rounded-xl border border-input-border text-text-main hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          aria-label={place.is_favorite ? t('places.unfavorite') : t('places.favorite')}
        >
          <span className="material-symbols-outlined">
            {place.is_favorite ? 'bookmark' : 'bookmark_border'}
          </span>
        </button>
      </div>
    </div>
  );
}
