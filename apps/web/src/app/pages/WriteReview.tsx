import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useI18n } from '@/app/providers';
import { getPlace, createReview, updateReview } from '@/lib/api/client';
import type { Review } from '@/lib/types';

type LocationState = { edit?: Review } | null;

export default function WriteReview() {
  const { placeCode } = useParams<{ placeCode: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const editReview = (location.state as LocationState)?.edit;

  const [placeName, setPlaceName] = useState('');
  const [rating, setRating] = useState(editReview?.rating ?? 0);
  const [title, setTitle] = useState(editReview?.title ?? '');
  const [body, setBody] = useState(editReview?.body ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!placeCode) return;
    getPlace(placeCode)
      .then((p) => setPlaceName(p.name))
      .catch(() => setPlaceName(''));
  }, [placeCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!placeCode) return;
    if (rating < 1 || rating > 5) {
      setError('Please select a rating (1–5 stars).');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (editReview) {
        await updateReview(editReview.review_code, {
          rating,
          title: title.trim() || undefined,
          body: body.trim() || undefined,
        });
      } else {
        await createReview(placeCode, {
          rating,
          title: title.trim() || undefined,
          body: body.trim() || undefined,
        });
      }
      navigate(`/places/${placeCode}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!placeCode) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <p className="text-text-muted">Missing place.</p>
        <button type="button" onClick={() => navigate('/home')} className="text-primary mt-2">
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <button
        type="button"
        onClick={() => navigate(`/places/${placeCode}`)}
        className="flex items-center gap-2 text-text-muted hover:text-primary mb-6"
      >
        <span className="material-symbols-outlined">arrow_back</span>
        Back
      </button>
      <h1 className="text-xl font-bold text-text-main mb-1">
        {editReview ? 'Edit your review' : t('places.writeReview')}
      </h1>
      {placeName && <p className="text-text-muted text-sm mb-6">{placeName}</p>}

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div>
          <label className="block text-sm font-medium text-text-main mb-2">Rating *</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label={`${value} stars`}
              >
                <span
                  className={`material-symbols-outlined text-3xl ${
                    value <= rating ? 'text-amber-500' : 'text-gray-300 dark:text-gray-600'
                  }`}
                >
                  {value <= rating ? 'star' : 'star_border'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-main mb-1">Title (optional)</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Summarize your experience"
            className="w-full border border-input-border rounded-xl px-4 py-3 text-text-main bg-white dark:bg-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-main mb-1">Review (optional)</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Tell others about your visit..."
            rows={4}
            className="w-full border border-input-border rounded-xl px-4 py-3 text-text-main bg-white dark:bg-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-main mb-1">Photos (optional)</label>
          <p className="text-xs text-text-muted">Photo upload will be added later.</p>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(`/places/${placeCode}`)}
            className="flex-1 py-3 rounded-xl border border-input-border text-text-main font-medium"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 py-3 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover disabled:opacity-50"
          >
            {submitting ? t('common.loading') : editReview ? t('common.save') : 'Submit'}
          </button>
        </div>
      </form>
    </div>
  );
}
