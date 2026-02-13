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
        className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-all border border-white/20 shadow-lg"
        aria-label="Share"
        title={status !== 'idle' ? (status === 'copied' ? 'Link copied' : 'Shared') : 'Share'}
      >
        <span className="material-symbols-outlined">share</span>
      </button>
    );
  }
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
  hideTitle = false,
}: {
  placeCode: string;
  reviews: Review[];
  averageRating?: number;
  reviewCount?: number;
  currentUserCode?: string | null;
  onReviewsChange: () => void;
  hideTitle?: boolean;
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
    <section className={hideTitle ? 'mb-10' : 'mb-24'}>
      {!hideTitle && (
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
      )}
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

  const isMosque = place.religion === 'islam';
  const heroImage = place.image_urls?.[0] ?? '';
  const rs = (place.religion_specific ?? {}) as Record<string, unknown>;
  const prayerTimes = (rs.prayer_times as Record<string, string> | undefined) ?? {};
  const getPrayer = (key: string) =>
    prayerTimes[key] ?? prayerTimes[key.toLowerCase()] ?? prayerTimes[key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()] ?? '';
  const prayerList = [
    { key: 'fajr', icon: 'wb_twilight' },
    { key: 'dhuhr', icon: 'sunny' },
    { key: 'asr', icon: 'wb_sunny' },
    { key: 'maghrib', icon: 'routine' },
    { key: 'isha', icon: 'nights_stay' },
  ] as const;
  const prayerDate = new Date();
  const prayerDateStr = prayerDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const capacity = rs.capacity != null ? String(rs.capacity) : null;
  const wuduArea = rs.wudu_area != null ? String(rs.wudu_area) : (Array.isArray(rs.facilities) && (rs.facilities as string[]).some((f) => /wudu|ablution/i.test(f)) ? 'Available' : null);
  const parking = rs.parking != null ? String(rs.parking) : null;
  const womensArea = rs.womens_area != null ? String(rs.womens_area) : (Array.isArray(rs.facilities) && (rs.facilities as string[]).some((f) => /women|female/i.test(f)) ? 'Separate' : null);
  const formatDistance = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

  const isTemple = place.religion === 'hinduism';
  const isChurch = place.religion === 'christianity';
  const todayKey = new Date().toLocaleDateString('en-GB', { weekday: 'long' }).toLowerCase();
  const openingHoursMap: Record<string, string> = {};
  if (place.opening_hours) {
    Object.entries(place.opening_hours).forEach(([k, v]) => {
      openingHoursMap[k.toLowerCase()] = v;
    });
  }
  const opensAtToday = openingHoursMap[todayKey] ?? place.opening_hours?.[todayKey] ?? '';
  const deities = (Array.isArray(rs.deities) ? rs.deities : []) as { name?: string; subtitle?: string; image_url?: string }[];
  const architecture = rs.architecture != null ? String(rs.architecture) : null;
  const nextFestival = rs.next_festival != null ? String(rs.next_festival) : null;
  const dressCode = rs.dress_code != null ? String(rs.dress_code) : null;
  const dressCodeNotes = rs.dress_code_notes != null ? String(rs.dress_code_notes) : null;
  const crowdLevel = rs.crowd_level != null ? String(rs.crowd_level) : null;
  const foundedYear = rs.founded_year != null ? String(rs.founded_year) : null;
  const style = rs.style != null ? String(rs.style) : null;
  const serviceTimes = (rs.service_times as { day?: string; name?: string; location?: string; time?: string }[] | Record<string, string>) ?? {};
  const serviceTimesArray = Array.isArray(serviceTimes) ? serviceTimes : Object.entries(serviceTimes).map(([day, v]) => ({ day, time: typeof v === 'string' ? v : (v as { time?: string })?.time ?? '' }));
  const websiteUrl = (rs.website_url as string) ?? (place as { website_url?: string }).website_url ?? null;

  if (isMosque) {
    return (
      <div className="w-full max-w-md mx-auto bg-background-light min-h-screen pb-32 relative overflow-hidden">
        {/* Hero */}
        <div className="relative h-[420px] w-full overflow-hidden rounded-b-[2.5rem] shadow-soft z-0">
          {heroImage ? (
            <img src={heroImage} alt="" className="absolute inset-0 w-full h-full object-cover scale-110" />
          ) : (
            <div className="absolute inset-0 bg-soft-blue flex items-center justify-center">
              <span className="material-symbols-outlined text-6xl text-slate-400">mosque</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
          <div className="absolute top-0 left-0 w-full p-6 pt-14 flex justify-between items-center z-20">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-all border border-white/20 shadow-lg"
              aria-label="Back"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <div className="flex gap-3">
              <SharePlaceButton placeName={place.name} placeCode={place.place_code} variant="glass" />
              <button
                type="button"
                onClick={toggleFavorite}
                disabled={favoriteLoading}
                className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-all border border-white/20 shadow-lg disabled:opacity-50"
                aria-label={place.is_favorite ? t('places.unfavorite') : t('places.favorite')}
              >
                <span className="material-symbols-outlined">{place.is_favorite ? 'bookmark' : 'bookmark_border'}</span>
              </button>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 w-full p-8 pb-10 z-10">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                {place.is_open_now && (
                  <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-500/90 backdrop-blur-sm text-white shadow-sm border border-emerald-400/30">
                    {t('places.openNow')}
                  </span>
                )}
                {place.distance != null && (
                  <span className="px-3 py-1 rounded-full text-[11px] font-medium bg-white/20 backdrop-blur-md text-white border border-white/20 flex items-center gap-1.5 shadow-sm">
                    <span className="material-symbols-outlined text-[14px]">near_me</span> {formatDistance(place.distance)}
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-bold text-white leading-tight drop-shadow-lg tracking-tight">{place.name}</h1>
              {place.address && (
                <p className="text-white/90 flex items-center gap-2 font-light text-sm">
                  <span className="material-symbols-outlined text-[18px]">location_on</span>
                  {place.address}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="relative z-10 -mt-8 px-4 space-y-6 pb-24">
          {/* Prayer Times */}
          {(getPrayer('fajr') || getPrayer('dhuhr') || getPrayer('asr') || getPrayer('maghrib') || getPrayer('isha')) && (
            <section className="bg-white px-6 py-8 rounded-3xl shadow-soft">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-lg font-bold text-text-main flex items-center gap-3">
                  <span className="material-symbols-outlined text-icon-grey text-2xl font-light">schedule</span>
                  {t('placeDetail.prayerTimes')}
                </h2>
                <span className="text-xs font-semibold tracking-wide text-primary uppercase border border-blue-100 bg-blue-50/50 px-3 py-1.5 rounded-full">
                  {prayerDateStr}
                </span>
              </div>
              <div className="flex justify-between items-center overflow-x-auto gap-4 pb-2 no-scrollbar px-1">
                {prayerList.map(({ key, icon }, idx) => {
                  const time = getPrayer(key) || '—';
                  const isCurrent = idx === 1;
                  return (
                    <div key={key} className="flex flex-col items-center gap-3 min-w-[60px] relative">
                      {isCurrent && (
                        <span className="absolute -top-2 right-1 w-2.5 h-2.5 bg-primary rounded-full ring-2 ring-white z-10" />
                      )}
                      <div
                        className={`w-14 h-14 rounded-full border flex items-center justify-center shadow-sm transition-colors ${
                          isCurrent ? 'w-16 h-16 border-2 border-primary bg-primary/5 scale-105' : 'border-gray-100 bg-white'
                        }`}
                      >
                        <span
                          className={`material-symbols-outlined font-light text-xl ${isCurrent ? 'text-primary text-2xl' : 'text-icon-grey'}`}
                        >
                          {icon}
                        </span>
                      </div>
                      <div className="text-center">
                        <span
                          className={`block text-[10px] font-bold uppercase tracking-widest mb-0.5 ${isCurrent ? 'text-primary' : 'text-text-muted'}`}
                        >
                          {t(`placeDetail.${key}`)}
                        </span>
                        <span className={`block text-sm font-medium text-text-main ${isCurrent ? 'text-base font-bold' : ''}`}>
                          {time}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* About */}
          {place.description && (
            <section className="bg-white px-8 py-8 shadow-soft rounded-3xl">
              <h2 className="text-lg font-bold text-text-main mb-4 flex items-center gap-3">
                <span className="material-symbols-outlined text-icon-grey text-2xl font-light">auto_stories</span>
                {t('placeDetail.about')}
              </h2>
              <p className="text-[15px] text-text-secondary leading-relaxed tracking-normal font-sans line-clamp-4">
                {place.description}
              </p>
              <button
                type="button"
                className="mt-4 text-xs font-bold uppercase tracking-widest text-primary hover:text-primary-dark transition-colors border-b border-primary/30 pb-0.5 hover:border-primary"
              >
                {t('placeDetail.readFullStory')}
              </button>
            </section>
          )}

          {/* Details & Facilities */}
          {(capacity || wuduArea || parking || womensArea) && (
            <section className="px-2">
              <h2 className="text-lg font-bold text-text-main mb-6 px-4">{t('placeDetail.detailsAndFacilities')}</h2>
              <div className="grid grid-cols-2 gap-4">
                {capacity && (
                  <div className="p-5 rounded-2xl bg-blue-tint border border-blue-100/50 flex flex-col gap-3 shadow-sm">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-icon-grey shadow-sm">
                      <span className="material-symbols-outlined text-xl">groups</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-blue-600/60 uppercase tracking-wider mb-1">{t('placeDetail.capacity')}</p>
                      <p className="text-lg font-bold text-blue-900 font-sans">{capacity}</p>
                    </div>
                  </div>
                )}
                {wuduArea && (
                  <div className="p-5 rounded-2xl bg-blue-tint border border-blue-100/50 flex flex-col gap-3 shadow-sm">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-icon-grey shadow-sm">
                      <span className="material-symbols-outlined text-xl">water_drop</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-blue-600/60 uppercase tracking-wider mb-1">{t('placeDetail.wuduArea')}</p>
                      <p className="text-lg font-bold text-blue-900 font-sans">{wuduArea}</p>
                    </div>
                  </div>
                )}
                {parking && (
                  <div className="p-5 rounded-2xl bg-blue-tint border border-blue-100/50 flex flex-col gap-3 shadow-sm">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-icon-grey shadow-sm">
                      <span className="material-symbols-outlined text-xl">local_parking</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-blue-600/60 uppercase tracking-wider mb-1">{t('placeDetail.parking')}</p>
                      <p className="text-lg font-bold text-blue-900 font-sans">{parking}</p>
                    </div>
                  </div>
                )}
                {womensArea && (
                  <div className="p-5 rounded-2xl bg-blue-tint border border-blue-100/50 flex flex-col gap-3 shadow-sm">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-icon-grey shadow-sm">
                      <span className="material-symbols-outlined text-xl">escalator_warning</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-blue-600/60 uppercase tracking-wider mb-1">{t('placeDetail.womensArea')}</p>
                      <p className="text-lg font-bold text-blue-900 font-sans">{womensArea}</p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Check-in & Directions */}
          <section className="px-2">
            <div className="w-full bg-white border border-gray-100 p-2 rounded-2xl shadow-card flex gap-2">
              <Link
                to={`/places/${place.place_code}/check-in`}
                className="flex-1 py-3 px-4 rounded-xl bg-gray-50 text-text-main font-bold flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors"
              >
                <span className="material-symbols-outlined text-xl text-primary">check_circle</span>
                <span className="text-sm">{t('places.checkIn')}</span>
              </Link>
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-[1.5] py-3 px-4 rounded-xl bg-text-main text-white font-bold shadow-lg shadow-black/10 flex items-center justify-center gap-2 hover:bg-black transition-colors"
              >
                <span className="material-symbols-outlined text-xl">directions</span>
                <span className="text-sm">{t('placeDetail.directions')}</span>
              </a>
            </div>
          </section>

          {/* Recent Reviews */}
          <section className="px-2 pt-4">
            <div className="flex justify-between items-end mb-6 px-4">
              <div>
                <h2 className="text-lg font-bold text-text-main mb-1">{t('placeDetail.recentReviews')}</h2>
                <p className="text-xs text-text-muted">{t('placeDetail.whatPeopleSay')}</p>
              </div>
              {(averageRating != null || (reviewCount != null && reviewCount > 0)) && (
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-gray-100 shadow-sm">
                  <span className="material-symbols-outlined text-amber-400 text-base">star</span>
                  <span className="text-sm font-bold text-text-main">{averageRating?.toFixed(1) ?? '—'}</span>
                  <span className="text-xs text-text-muted font-normal border-l border-gray-200 pl-2 ml-1">
                    {reviewCount ?? 0} reviews
                  </span>
                </div>
              )}
            </div>
            <ReviewsPreview
              placeCode={place.place_code}
              reviews={reviews}
              averageRating={averageRating}
              reviewCount={reviewCount}
              currentUserCode={user?.user_code}
              onReviewsChange={fetchPlace}
              hideTitle
            />
          </section>
        </div>
      </div>
    );
  }

  if (isTemple) {
    return (
      <div className="w-full max-w-md mx-auto bg-white min-h-screen pb-32">
        <div className="relative h-[55vh] w-full overflow-hidden">
          {heroImage ? (
            <img src={heroImage} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-soft-blue flex items-center justify-center">
              <span className="material-symbols-outlined text-6xl text-slate-400">temple_hindu</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80" />
          <div className="absolute top-0 left-0 w-full z-20 pt-14 px-6 flex justify-between items-center">
            <button type="button" onClick={() => navigate(-1)} className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20" aria-label="Back">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <div className="flex gap-3">
              <SharePlaceButton placeName={place.name} placeCode={place.place_code} variant="glass" />
              <button type="button" onClick={toggleFavorite} disabled={favoriteLoading} className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20 disabled:opacity-50" aria-label={place.is_favorite ? t('places.unfavorite') : t('places.favorite')}>
                <span className="material-symbols-outlined">{place.is_favorite ? 'bookmark' : 'bookmark_border'}</span>
              </button>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 w-full p-8 text-white z-10">
            <div className="flex items-center gap-3 mb-3">
              <span className="px-3 py-1 bg-white/20 backdrop-blur-sm border border-white/30 rounded-full text-[10px] font-bold tracking-widest uppercase">{t('placeDetail.hinduTemple')}</span>
              {averageRating != null && (
                <span className="flex items-center text-amber-200 text-sm font-medium bg-black/30 backdrop-blur-sm px-2 py-0.5 rounded-md">
                  <span className="material-symbols-outlined text-sm mr-1">star</span>
                  {averageRating.toFixed(1)}
                </span>
              )}
            </div>
            <h1 className="text-4xl font-bold mb-2 leading-tight tracking-tight text-white drop-shadow-md">{place.name}</h1>
            {place.address && (
              <div className="flex items-center text-slate-200 text-sm font-light">
                <span className="material-symbols-outlined text-sm mr-1 opacity-80">location_on</span>
                {place.address}
              </div>
            )}
          </div>
        </div>
        <div className="relative -mt-10 bg-white rounded-t-[2.5rem] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] overflow-hidden">
          <div className="pt-10 pb-8 px-8 flex justify-between items-center border-b border-slate-50">
            <div className="flex flex-col items-center gap-1 min-w-[80px]">
              <span className="material-symbols-outlined text-primary text-2xl font-light">schedule</span>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mt-1">{t('placeDetail.opensAt')}</p>
              <p className="text-slate-900 font-semibold">{opensAtToday || '—'}</p>
            </div>
            <div className="w-px h-8 bg-slate-100" />
            <div className="flex flex-col items-center gap-1 min-w-[80px]">
              <span className="material-symbols-outlined text-primary text-2xl font-light">near_me</span>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mt-1">{t('placeDetail.distance')}</p>
              <p className="text-slate-900 font-semibold">{place.distance != null ? formatDistance(place.distance) : '—'}</p>
            </div>
            <div className="w-px h-8 bg-slate-100" />
            <div className="flex flex-col items-center gap-1 min-w-[80px]">
              <span className="material-symbols-outlined text-green-500 text-2xl font-light">groups</span>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mt-1">{t('placeDetail.crowd')}</p>
              <p className="text-green-600 font-semibold">{crowdLevel || '—'}</p>
            </div>
          </div>
          {place.description && (
            <div className="px-8 py-8">
              <h2 className="text-xl font-bold text-slate-900 mb-3">{t('placeDetail.sanctumStory')}</h2>
              <p className="text-slate-600 leading-relaxed text-[15px] line-clamp-3">{place.description}</p>
              <button type="button" className="text-primary font-medium mt-2 hover:underline">{t('common.readMore')}</button>
            </div>
          )}
          {deities.length > 0 && (
            <div className="bg-soft-blue py-10 pl-8 overflow-hidden">
              <div className="flex justify-between items-end mb-6 pr-8">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{t('placeDetail.divinePresence')}</h2>
                  <p className="text-xs text-slate-500 mt-1">{t('placeDetail.principalDeities')}</p>
                </div>
              </div>
              <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4 pr-8">
                {deities.map((d, i) => (
                  <div key={i} className="flex-shrink-0 flex flex-col items-center">
                    <div className="w-28 h-28 rounded-full p-1.5 border border-amber-300/30 bg-white shadow-soft mb-3 overflow-hidden">
                      {d.image_url ? <img src={d.image_url} alt="" className="w-full h-full rounded-full object-cover" /> : <div className="w-full h-full rounded-full bg-slate-100 flex items-center justify-center"><span className="material-symbols-outlined text-3xl text-slate-400">temple_hindu</span></div>}
                    </div>
                    <span className="text-sm font-semibold text-slate-800">{d.name ?? 'Deity'}</span>
                    {d.subtitle && <span className="text-[10px] text-slate-500 uppercase tracking-wide">{d.subtitle}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {(architecture || nextFestival || dressCode) && (
            <div className="px-8 py-10 bg-white">
              <h2 className="text-xl font-bold text-slate-900 mb-6">{t('placeDetail.essentialInfo')}</h2>
              <div className="grid grid-cols-2 gap-4">
                {architecture && (
                  <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-primary mb-3"><span className="material-symbols-outlined text-xl">temple_hindu</span></div>
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">{t('placeDetail.architecture')}</p>
                    <p className="text-sm font-semibold text-slate-800">{architecture}</p>
                  </div>
                )}
                {nextFestival && (
                  <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm">
                    <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-500 mb-3"><span className="material-symbols-outlined text-xl">festival</span></div>
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">{t('placeDetail.nextFestival')}</p>
                    <p className="text-sm font-semibold text-slate-800">{nextFestival}</p>
                  </div>
                )}
                {dressCode && (
                  <div className="col-span-2 p-5 rounded-2xl bg-gradient-to-br from-blue-50 to-white border border-blue-100 flex gap-4 items-center">
                    <div className="w-12 h-12 rounded-full bg-white shadow-sm flex-shrink-0 flex items-center justify-center text-primary"><span className="material-symbols-outlined text-2xl">checkroom</span></div>
                    <div className="flex-1">
                      <p className="text-[10px] text-primary font-bold uppercase tracking-wider mb-1">{t('placeDetail.dressCode')}</p>
                      <p className="text-sm font-semibold text-slate-800">{dressCode}</p>
                      {dressCodeNotes && <p className="text-xs text-slate-500 mt-1">{dressCodeNotes}</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="px-8 pb-10">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-bold text-slate-900">{t('placeDetail.pilgrimVoices')}</h2>
              {averageRating != null && (
                <div className="flex items-center gap-1.5 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">
                  <span className="text-amber-600 font-bold text-sm">{averageRating.toFixed(1)}</span>
                  <span className="material-symbols-outlined text-sm text-amber-500">star</span>
                </div>
              )}
            </div>
            <ReviewsPreview placeCode={place.place_code} reviews={reviews} averageRating={averageRating} reviewCount={reviewCount} currentUserCode={user?.user_code} onReviewsChange={fetchPlace} hideTitle />
          </div>
        </div>
        <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto bg-white border-t border-slate-200 px-6 py-3 flex items-center gap-2">
          <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-input-border text-text-main hover:bg-gray-50 font-medium text-sm">{t('placeDetail.directions')}</a>
          <Link to={`/places/${place.place_code}/check-in`} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white font-medium text-sm"><span className="material-symbols-outlined text-lg">check_circle</span>{t('places.checkIn')}</Link>
        </div>
      </div>
    );
  }

  if (isChurch) {
    return (
      <div className="w-full max-w-md mx-auto bg-white min-h-screen pb-24">
        <div className="relative h-[420px] w-full">
          {heroImage ? (
            <img src={heroImage} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-soft-blue flex items-center justify-center">
              <span className="material-symbols-outlined text-6xl text-slate-400">church</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute top-0 left-0 right-0 z-30 p-6 pt-14 flex justify-between items-center">
            <button type="button" onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white" aria-label="Back">
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <div className="flex gap-3">
              <button type="button" onClick={toggleFavorite} disabled={favoriteLoading} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white disabled:opacity-50" aria-label={place.is_favorite ? t('places.unfavorite') : t('places.favorite')}>
                <span className="material-symbols-outlined text-[20px]">{place.is_favorite ? 'bookmark' : 'bookmark_border'}</span>
              </button>
              <SharePlaceButton placeName={place.name} placeCode={place.place_code} variant="glass" />
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-8 pb-12 text-white">
            <div className="flex items-center gap-2 mb-3">
              {place.place_type && <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm border border-white/10 text-xs font-medium tracking-wide">{place.place_type}</span>}
              {place.is_open_now && (
                <span className="px-3 py-1 rounded-full bg-green-500/80 backdrop-blur-sm text-xs font-medium tracking-wide flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> {t('places.openNow')}
                </span>
              )}
            </div>
            <h1 className="text-4xl font-semibold leading-tight mb-2">{place.name}</h1>
            {place.address && <div className="flex items-center text-white/90 text-sm font-light"><span className="material-symbols-outlined text-[18px] mr-1.5">location_on</span>{place.address}</div>}
          </div>
        </div>
        <div className="relative bg-white -mt-6 rounded-t-[2.5rem] px-8 pt-10 pb-8">
          <div className="flex justify-between items-center mb-10 border-b border-gray-100 pb-6">
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-900">{averageRating?.toFixed(1) ?? '—'}</span>
                <span className="text-slate-400 text-xs font-medium">/ 5.0</span>
              </div>
              <div className="text-xs text-slate-500 font-medium tracking-wide uppercase">{t('placeDetail.reviewsCount')} ({reviewCount ?? 0})</div>
            </div>
            <div className="h-8 w-px bg-gray-100" />
            <div className="flex flex-col gap-1">
              <div className="text-2xl font-bold text-slate-900">{foundedYear ?? '—'}</div>
              <div className="text-xs text-slate-500 font-medium tracking-wide uppercase">{t('placeDetail.founded')}</div>
            </div>
            <div className="h-8 w-px bg-gray-100" />
            <div className="flex flex-col gap-1">
              <div className="text-2xl font-bold text-slate-900">{style ?? '—'}</div>
              <div className="text-xs text-slate-500 font-medium tracking-wide uppercase">{t('placeDetail.style')}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-12">
            <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-3 py-4 px-6 rounded-2xl bg-blue-50 text-primary font-medium hover:bg-blue-100 transition-colors">
              <span className="material-symbols-outlined">near_me</span>
              {t('placeDetail.directions')}
            </a>
            {websiteUrl ? (
              <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-3 py-4 px-6 rounded-2xl bg-gray-50 text-slate-600 font-medium hover:bg-gray-100 transition-colors">
                <span className="material-symbols-outlined">language</span>
                {t('placeDetail.visitWebsite')}
              </a>
            ) : null}
          </div>
          {place.description && (
            <div className="mb-12">
              <h2 className="font-semibold text-2xl text-slate-900 mb-4">{t('placeDetail.theSanctuary')}</h2>
              <p className="text-slate-500 leading-relaxed text-base">{place.description}</p>
            </div>
          )}
          {serviceTimesArray.length > 0 && (
            <div className="mb-12">
              <h2 className="font-semibold text-2xl text-slate-900 mb-6">{t('placeDetail.serviceTimes')}</h2>
              <div className="border border-gray-100 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {serviceTimesArray.map((row, i) => {
                      const day = 'day' in row ? row.day : (row as { [k: string]: unknown }).day ?? '';
                      const name = 'name' in row ? row.name : '';
                      const time = 'time' in row ? row.time : (row as Record<string, string>).time ?? '';
                      const location = 'location' in row ? row.location : '';
                      return (
                        <tr key={i} className="hover:bg-gray-50/50">
                          <td className="p-5 w-1/3 text-slate-400 font-medium">{day}</td>
                          <td className="p-5"><div className="font-semibold text-slate-800">{name}</div>{location ? <div className="text-xs text-slate-500">{location}</div> : null}</td>
                          <td className="p-5 text-right font-semibold text-lg text-slate-800">{time}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="mb-8">
            <h2 className="font-semibold text-2xl text-slate-900 mb-6">{t('placeDetail.pilgrimVoices')}</h2>
            <ReviewsPreview placeCode={place.place_code} reviews={reviews} averageRating={averageRating} reviewCount={reviewCount} currentUserCode={user?.user_code} onReviewsChange={fetchPlace} hideTitle />
          </div>
        </div>
        <div className="fixed bottom-0 left-0 right-0 z-20 px-6 pb-8 flex justify-center">
          <Link to={`/places/${place.place_code}/check-in`} className="bg-primary text-white font-medium py-4 px-8 rounded-full shadow-lg flex items-center gap-3 max-w-sm w-full justify-center">
            <span className="material-symbols-outlined text-[22px]">hiking</span>
            {t('placeDetail.startPilgrimage')}
          </Link>
        </div>
      </div>
    );
  }

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
