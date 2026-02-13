import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getPlace, getPlaceReviews, checkIn, addFavorite, removeFavorite } from '@/api/client';
import type { PlaceDetail as PlaceDetailType, ReviewsResponse } from '@/types';

export default function PlaceDetail() {
  const { placeCode } = useParams<{ placeCode: string }>();
  const navigate = useNavigate();
  const [place, setPlace] = useState<PlaceDetailType | null>(null);
  const [reviews, setReviews] = useState<ReviewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInNote, setCheckInNote] = useState('');
  const [showCheckInModal, setShowCheckInModal] = useState(false);

  const fetchPlace = () => {
    if (!placeCode) return;
    setLoading(true);
    setError('');
    Promise.all([getPlace(placeCode), getPlaceReviews(placeCode)])
      .then(([p, r]) => {
        setPlace(p);
        setReviews(r);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!placeCode) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([getPlace(placeCode), getPlaceReviews(placeCode)])
      .then(([p, r]) => {
        if (!cancelled) {
          setPlace(p);
          setReviews(r);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [placeCode]);

  const handleCheckIn = async () => {
    if (!placeCode) return;
    setCheckingIn(true);
    try {
      await checkIn(placeCode, { note: checkInNote || undefined });
      setShowCheckInModal(false);
      setCheckInNote('');
      setPlace((prev) => prev ? { ...prev, user_has_checked_in: true } : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check-in failed');
    } finally {
      setCheckingIn(false);
    }
  };

  const handleFavoriteToggle = async () => {
    if (!placeCode || !place) return;
    try {
      if (place.is_favorite) {
        await removeFavorite(placeCode);
        setPlace({ ...place, is_favorite: false });
      } else {
        await addFavorite(placeCode);
        setPlace({ ...place, is_favorite: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update favorite');
    }
  };

  if (loading) return <div className="max-w-md mx-auto px-5 py-8 text-text-muted">Loading...</div>;
  if (error || !place) {
    return (
      <div className="max-w-md mx-auto px-5 py-8">
        <p className="text-red-600 mb-2">{error || 'Place not found'}</p>
        <button type="button" onClick={fetchPlace} className="text-primary font-medium">Retry</button>
      </div>
    );
  }

  const rs = place.religion_specific || {};
  const isHindu = place.religion === 'hinduism';
  const isIslam = place.religion === 'islam';
  const isChristian = place.religion === 'christianity';

  return (
    <div className="max-w-md mx-auto pb-24">
      <div className="relative">
        <div className="h-56 bg-gray-200 flex items-center justify-center">
          {place.image_urls?.[0] ? (
            <img src={place.image_urls[0]} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="material-symbols-outlined text-6xl text-gray-400">place</span>
          )}
        </div>
        <div className="absolute top-4 left-4 right-4 flex justify-between">
          <button type="button" onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white/90 shadow flex items-center justify-center" aria-label="Back">
            <span className="material-icons text-xl">arrow_back</span>
          </button>
          <button type="button" className="w-10 h-10 rounded-full bg-white/90 shadow flex items-center justify-center" aria-label="Share">
            <span className="material-icons text-xl">share</span>
          </button>
        </div>
      </div>

      <div className="px-5 -mt-4 relative z-10">
        <div className="bg-white rounded-t-2xl shadow-sm pt-5 pb-6 px-5">
          <h1 className="text-xl font-bold text-text-main mb-1">{place.name}</h1>
          <p className="text-sm text-text-muted flex items-center">
            <span className="material-icons text-primary text-sm mr-1">location_on</span>
            {place.address}
          </p>
          {reviews?.average_rating != null && (
            <p className="mt-2 text-sm flex items-center gap-1">
              <span className="material-icons text-yellow-500 text-lg">star</span>
              <span className="font-semibold text-gray-800">{reviews.average_rating}</span>
              <span className="text-gray-500">({reviews.review_count} reviews)</span>
            </p>
          )}

          {place.opening_hours && Object.keys(place.opening_hours).length > 0 && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-text-main mb-2">Opening hours</h2>
              <div className="text-sm text-text-muted space-y-1">
                {Object.entries(place.opening_hours).map(([day, hours]) => (
                  <div key={day} className="flex justify-between">{day}: {hours}</div>
                ))}
              </div>
            </section>
          )}

          {place.description && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-text-main mb-2">About</h2>
              <p className="text-sm text-text-muted">{place.description}</p>
            </section>
          )}

          {isHindu && (rs.deities || rs.festival_dates || rs.dress_code) && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-text-main mb-2">Temple info</h2>
              {Array.isArray(rs.deities) && rs.deities.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs text-text-muted mb-1">Main Deities</p>
                  <div className="flex gap-2 flex-wrap">
                    {rs.deities.map((d: { name?: string }, i: number) => (
                      <span key={i} className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm">{d.name || 'Deity'}</span>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(rs.festival_dates) && rs.festival_dates.length > 0 && (
                <p className="text-sm text-text-muted mb-1">Festivals: {rs.festival_dates.join(', ')}</p>
              )}
              {rs.dress_code && <p className="text-sm text-text-muted">Dress code: {String(rs.dress_code)}</p>}
            </section>
          )}

          {isIslam && (rs.prayer_times || rs.capacity || rs.facilities) && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-text-main mb-2">Prayer & facilities</h2>
              {rs.prayer_times && typeof rs.prayer_times === 'object' && Object.keys(rs.prayer_times as object).length > 0 && (
                <div className="text-sm text-text-muted mb-2">
                  {Object.entries(rs.prayer_times as Record<string, string>).map(([name, time]) => (
                    <div key={name}>{name}: {time}</div>
                  ))}
                </div>
              )}
              {rs.capacity != null && <p className="text-sm text-text-muted">Capacity: {rs.capacity}</p>}
              {Array.isArray(rs.facilities) && rs.facilities.length > 0 && (
                <p className="text-sm text-text-muted mt-1">Facilities: {rs.facilities.join(', ')}</p>
              )}
            </section>
          )}

          {isChristian && (rs.denomination || rs.service_times || rs.notable_features) && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-text-main mb-2">Service info</h2>
              {rs.denomination && <p className="text-sm text-text-muted">Denomination: {String(rs.denomination)}</p>}
              {rs.service_times && typeof rs.service_times === 'object' && (
                <div className="text-sm text-text-muted mt-1">
                  {Object.entries(rs.service_times as Record<string, string>).map(([k, v]) => (
                    <div key={k}>{k}: {v}</div>
                  ))}
                </div>
              )}
              {Array.isArray(rs.notable_features) && rs.notable_features.length > 0 && (
                <p className="text-sm text-text-muted mt-1">Notable: {rs.notable_features.join(', ')}</p>
              )}
            </section>
          )}

          <section className="mt-6">
            <h2 className="text-sm font-semibold text-text-main mb-2">Visitor reviews</h2>
            {reviews?.reviews && reviews.reviews.length > 0 ? (
              <div className="space-y-3">
                {reviews.reviews.slice(0, 3).map((r) => (
                  <div key={r.review_code} className="text-sm border-b border-gray-100 pb-2 last:border-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-text-main">{r.display_name}</span>
                      <span className="text-yellow-500 flex">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                      <span className="text-gray-400 text-xs">{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                    {r.title && <p className="font-medium text-gray-800">{r.title}</p>}
                    {r.body && <p className="text-text-muted">{r.body}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted">No reviews yet.</p>
            )}
            <Link to={`/places/${placeCode}/review`} className="inline-block mt-2 text-primary font-medium text-sm">Write a review</Link>
          </section>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-200 px-5 py-3 flex gap-3 safe-area-bottom">
        <a href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-3 rounded-xl border border-gray-200 text-center text-sm font-medium text-text-main">
          Get Directions
        </a>
        <button
          type="button"
          onClick={() => setShowCheckInModal(true)}
          className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-medium"
        >
          {place.user_has_checked_in ? 'Checked in' : 'Check-in Here'}
        </button>
        <button
          type="button"
          onClick={handleFavoriteToggle}
          className="p-3 rounded-xl border border-gray-200"
          aria-label={place.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <span className="material-icons text-xl">{place.is_favorite ? 'bookmark' : 'bookmark_border'}</span>
        </button>
      </div>

      {showCheckInModal && (
        <div className="fixed inset-0 z-20 bg-black/50 flex items-end justify-center p-4">
          <div className="bg-white rounded-t-2xl w-full max-w-md p-5 pb-8">
            <h3 className="text-lg font-bold text-text-main mb-3">Check in at {place.name}</h3>
            <textarea
              placeholder="Add a note (optional)"
              value={checkInNote}
              onChange={(e) => setCheckInNote(e.target.value)}
              className="w-full border border-gray-200 rounded-xl p-3 text-sm mb-4 min-h-[80px]"
            />
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowCheckInModal(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-text-main font-medium">
                Cancel
              </button>
              <button type="button" onClick={handleCheckIn} disabled={checkingIn} className="flex-1 py-3 rounded-xl bg-primary text-white font-medium disabled:opacity-50">
                {checkingIn ? 'Checking in...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
