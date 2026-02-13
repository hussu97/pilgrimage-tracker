import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useI18n } from '@/context/I18nContext';
import { createReview } from '@/api/client';

export default function WriteReview() {
  const { placeCode } = useParams<{ placeCode: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!placeCode) return;
    setSubmitting(true);
    setError('');
    try {
      await createReview(placeCode, { rating, title: title || undefined, body: body || undefined });
      navigate(`/places/${placeCode}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-5 py-6">
      <h1 className="text-xl font-bold text-text-main mb-4">{t('places.writeReview')}</h1>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-main mb-2">Rating</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((r) => (
              <button key={r} type="button" onClick={() => setRating(r)} className="text-2xl text-yellow-500">
                {r <= rating ? '★' : '☆'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-text-main mb-1">Title (optional)</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-3" />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-main mb-1">Your review</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-3 min-h-[100px]" />
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => navigate(-1)} className="flex-1 py-3 rounded-xl border border-gray-200 text-text-main font-medium">{t('common.cancel')}</button>
          <button type="submit" disabled={submitting} className="flex-1 py-3 rounded-xl bg-primary text-white font-medium disabled:opacity-50">{submitting ? t('common.loading') : t('common.save')}</button>
        </div>
      </form>
    </div>
  );
}
