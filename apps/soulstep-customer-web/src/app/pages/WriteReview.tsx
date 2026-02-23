import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useI18n, useFeedback } from '@/app/providers';
import { cn } from '@/lib/utils/cn';
import { getPlace, createReview, updateReview, uploadReviewPhoto } from '@/lib/api/client';
import { compressImage, validateImageFile } from '@/lib/utils/imageUpload';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import type { PlaceDetail } from '@/lib/types';
import type { Review } from '@/lib/types';

interface UploadedImage {
  id: number;
  url: string;
  width: number;
  height: number;
  thumbnailUrl: string;
}

type LocationState = { edit?: Review } | null;

export default function WriteReview() {
  const { placeCode } = useParams<{ placeCode: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const { showSuccess, showError } = useFeedback();
  const editReview = (location.state as LocationState)?.edit;

  const [place, setPlace] = useState<PlaceDetail | null>(null);
  const [rating, setRating] = useState(editReview?.rating ?? 0);
  const [body, setBody] = useState(editReview?.body ?? '');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [photos, setPhotos] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!placeCode) return;
    getPlace(placeCode)
      .then(setPlace)
      .catch(() => setPlace(null));
  }, [placeCode]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Check photo limit
    const MAX_PHOTOS = 5;
    const remainingSlots = MAX_PHOTOS - photos.length;
    if (files.length > remainingSlots) {
      setUploadError(t('reviews.maxPhotos').replace('{count}', String(MAX_PHOTOS)));
      return;
    }

    setUploading(true);
    setUploadError('');

    try {
      for (const file of files) {
        // Validate
        const validation = validateImageFile(file);
        if (!validation.valid) {
          setUploadError(validation.error || t('reviews.invalidImage'));
          continue;
        }

        // Compress
        const { blob } = await compressImage(file);

        // Upload
        const result = await uploadReviewPhoto(blob);

        // Create thumbnail URL for preview
        const thumbnailUrl = URL.createObjectURL(blob);

        setPhotos((prev) => [...prev, { ...result, thumbnailUrl }]);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('reviews.uploadFailed'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePhoto = (id: number) => {
    setPhotos((prev) => {
      const photo = prev.find((p) => p.id === id);
      if (photo) {
        URL.revokeObjectURL(photo.thumbnailUrl);
      }
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!placeCode) return;
    if (rating < 1 || rating > 5) {
      setError(t('reviews.selectRating'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (editReview) {
        await updateReview(editReview.review_code, {
          rating,
          title: editReview.title,
          body: body.trim() || undefined,
        });
        showSuccess(t('feedback.reviewUpdated'));
      } else {
        await createReview(placeCode, {
          rating,
          body: body.trim() || undefined,
          is_anonymous: isAnonymous,
          photo_urls: photos.map((p) => p.url),
        });
        showSuccess(t('feedback.reviewSubmitted'));
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      showError(t('feedback.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturn = () => {
    if (placeCode) navigate(`/places/${placeCode}`, { replace: true });
  };

  if (!placeCode) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <p className="text-text-muted dark:text-dark-text-secondary">{t('places.missingCode')}</p>
        <button type="button" onClick={() => navigate('/home')} className="text-primary mt-2">
          {t('common.backToHome')}
        </button>
      </div>
    );
  }

  return (
    <main className="w-full max-w-md mx-auto bg-white dark:bg-dark-bg min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 pt-6 pb-2 sticky top-0 bg-white dark:bg-dark-surface z-30 border-b border-slate-100 dark:border-dark-border">
        <button
          type="button"
          onClick={() => navigate(`/places/${placeCode}`)}
          className="text-text-muted dark:text-dark-text-secondary text-sm font-light hover:text-text-main dark:hover:text-white transition-colors"
        >
          {t('common.cancel')}
        </button>
        <h1 className="text-xs font-medium text-text-main dark:text-white uppercase tracking-wide">
          {t('writeReview.title')}
        </h1>
        {editReview ? (
          <button
            type="button"
            onClick={() => handleSubmit({ preventDefault: () => {} } as React.FormEvent)}
            disabled={submitting}
            className="text-primary font-medium text-sm hover:opacity-70 disabled:opacity-50"
          >
            {t('common.save')}
          </button>
        ) : (
          <div className="w-12" />
        )}
      </header>

      <div className="flex-1 overflow-y-auto pb-32">
        <section className="px-6 pt-6 pb-2">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-2xl font-light text-text-dark dark:text-white leading-tight">
                {place?.name ?? '…'}
              </h2>
              <p className="text-xs text-text-muted mt-1 font-light tracking-wide uppercase">
                {place?.address ?? ''}
              </p>
            </div>
            {place?.images?.[0]?.url && (
              <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 opacity-90">
                <img
                  src={getFullImageUrl(place.images[0].url)}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>
        </section>

        <form id="write-review-form" onSubmit={handleSubmit} className="px-6 py-6">
          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

          <section className="mb-6">
            <div className="flex gap-2 items-center flex-wrap">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  className="focus:outline-none transition-transform active:scale-95"
                  aria-label={t('reviews.starsAccessibility').replace('{count}', String(value))}
                >
                  <span
                    className={cn(
                      'material-symbols-outlined text-3xl',
                      value <= rating ? 'text-amber-400' : 'text-slate-300',
                    )}
                    style={{ fontVariationSettings: "'FILL' 1, 'wght' 200" }}
                  >
                    star
                  </span>
                </button>
              ))}
              <span className="ml-3 text-sm text-text-muted font-light italic">
                {rating
                  ? t(
                      [
                        '',
                        'writeReview.ratingPoor',
                        'writeReview.ratingFair',
                        'writeReview.ratingGood',
                        'writeReview.ratingVeryGood',
                        'writeReview.ratingExcellent',
                      ][rating],
                    )
                  : ''}
              </span>
            </div>
          </section>

          <section className="mb-6">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('writeReview.shareExperience')}
              rows={6}
              className="w-full bg-transparent border-none p-0 text-lg text-text-main placeholder-text-muted focus:ring-0 resize-none font-light leading-relaxed"
            />
          </section>

          <section className="mb-6">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            {uploadError && <p className="text-red-600 text-sm mb-2">{uploadError}</p>}
            <div className="flex items-center gap-4 overflow-x-auto pb-2">
              {photos.length < 5 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex-shrink-0 w-16 h-16 border border-dashed border-slate-300 dark:border-dark-border rounded-lg flex items-center justify-center hover:bg-slate-50 dark:hover:bg-dark-surface transition-colors text-text-muted dark:text-dark-text-secondary disabled:opacity-50"
                  aria-label={t('writeReview.addPhoto')}
                >
                  {uploading ? (
                    <span className="material-symbols-outlined text-xl animate-spin">sync</span>
                  ) : (
                    <span className="material-symbols-outlined text-xl">add_a_photo</span>
                  )}
                </button>
              )}
              {photos.map((photo) => (
                <div key={photo.id} className="relative flex-shrink-0">
                  <img
                    src={photo.thumbnailUrl}
                    alt="Review photo"
                    className="w-16 h-16 object-cover rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(photo.id)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                    aria-label="Remove photo"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-light text-text-secondary">
                {t('writeReview.postAnonymously')}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={isAnonymous}
                onClick={() => setIsAnonymous((a) => !a)}
                className={cn(
                  'relative inline-flex h-5 w-10 shrink-0 rounded-full border transition-colors',
                  isAnonymous ? 'bg-primary border-primary' : 'bg-slate-200 border-slate-200',
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-4 w-4 top-0.5 rounded-full bg-white shadow ring-0 transition-transform absolute',
                    isAnonymous ? 'translate-x-5 left-0.5' : 'translate-x-0.5 left-0.5',
                  )}
                />
              </button>
            </div>
          </section>
        </form>
      </div>

      {!editReview && (
        <div className="fixed bottom-24 right-6 z-40">
          <button
            type="button"
            onClick={() => handleSubmit({ preventDefault: () => {} } as React.FormEvent)}
            disabled={submitting}
            className="bg-primary hover:bg-primary-hover text-white font-medium py-3 px-6 rounded-full shadow-lg hover:shadow-xl active:scale-95 transition-all flex items-center gap-2 disabled:opacity-70"
          >
            <span>{t('writeReview.submit')}</span>
            <span className="material-symbols-outlined text-base">arrow_forward</span>
          </button>
        </div>
      )}

      {editReview && (
        <div className="px-6 pb-8 pt-4">
          <button
            type="submit"
            form="write-review-form"
            disabled={submitting}
            className="w-full bg-primary text-white font-medium py-3.5 px-6 rounded-xl disabled:opacity-70"
          >
            {submitting ? t('common.loading') : t('common.save')}
          </button>
        </div>
      )}

      {success && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm p-6">
          <div className="bg-white dark:bg-dark-surface w-full max-w-sm rounded-2xl p-8 text-center shadow-xl border border-slate-100 dark:border-dark-border">
            <div className="w-12 h-12 bg-soft-blue dark:bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-2xl text-primary">check</span>
            </div>
            <h3 className="text-lg font-medium text-text-main dark:text-white mb-2">
              {t('writeReview.reviewPosted')}
            </h3>
            <p className="text-text-muted dark:text-dark-text-secondary text-sm font-light mb-6">
              {t('writeReview.yourVoiceHeard')}
            </p>
            <button
              type="button"
              onClick={handleReturn}
              className="text-primary font-medium text-sm hover:text-primary-hover transition-colors"
            >
              {t('writeReview.return')}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
