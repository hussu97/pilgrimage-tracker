import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useI18n } from '@/app/providers';
import { getPlace, checkIn } from '@/lib/api/client';
import { shareUrl } from '@/lib/share';

export default function CheckInPage() {
  const { placeCode } = useParams<{ placeCode: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [placeName, setPlaceName] = useState<string>('');
  const [note, setNote] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!placeCode) return;
    getPlace(placeCode)
      .then((p) => setPlaceName(p.name))
      .catch(() => setPlaceName(''));
  }, [placeCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!placeCode) return;
    setSubmitting(true);
    setError('');
    try {
      await checkIn(placeCode, {
        note: note.trim() || undefined,
        photo_url: photoUrl.trim() || undefined,
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackToPlace = () => {
    navigate(`/places/${placeCode}`);
  };

  if (!placeCode) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <p className="text-text-muted mb-4">Missing place.</p>
        <button type="button" onClick={() => navigate('/home')} className="text-primary font-medium">
          Back to Home
        </button>
      </div>
    );
  }

  if (success && placeCode) {
    const placeShareUrl = `/places/${placeCode}`;
    const handleShare = () => shareUrl(placeName || 'Place', placeShareUrl);
    return (
      <div className="max-w-md mx-auto px-4 py-8 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-3xl text-primary">check_circle</span>
        </div>
        <h2 className="text-xl font-semibold text-text-main mb-2">You&apos;ve checked in at {placeName || 'this place'}</h2>
        <p className="text-text-muted text-sm mb-6">Your visit has been recorded.</p>
        <div className="flex gap-3 mb-4">
          <button
            type="button"
            onClick={handleShare}
            className="flex-1 py-3 rounded-xl border border-input-border text-text-main font-medium hover:bg-soft-blue inline-flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined">share</span>
            Share
          </button>
          <button
            type="button"
            onClick={handleBackToPlace}
            className="flex-1 py-3 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover"
          >
            Back to place
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-text-muted hover:text-primary mb-6"
      >
        <span className="material-symbols-outlined">arrow_back</span>
        Back
      </button>
      <h1 className="text-xl font-bold text-text-main mb-1">{t('places.checkIn')}</h1>
      {placeName && <p className="text-text-muted text-sm mb-6">{placeName}</p>}

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-text-main mb-1">Note (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note about your visit..."
            rows={3}
            className="w-full border border-input-border rounded-xl px-4 py-3 text-text-main bg-surface placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-main mb-1">Photo (optional)</label>
          <input
            type="url"
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            placeholder="Photo URL (upload coming later)"
            className="w-full border border-input-border rounded-xl px-4 py-3 text-text-main bg-surface placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <p className="text-xs text-text-muted mt-1">Paste an image URL for now. Photo upload will be added later.</p>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleBackToPlace}
            className="flex-1 py-3 rounded-xl border border-input-border text-text-main font-medium hover:bg-soft-blue"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 py-3 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover disabled:opacity-50"
          >
            {submitting ? t('common.loading') : t('places.checkIn')}
          </button>
        </div>
      </form>
    </div>
  );
}
