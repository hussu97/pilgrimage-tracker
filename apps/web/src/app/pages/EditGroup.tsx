import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useI18n } from '@/app/providers';
import { getGroup, updateGroup, getGroupMembers, getPlaces } from '@/lib/api/client';
import { useAuth } from '@/app/providers';
import PlaceSelector from '@/components/groups/PlaceSelector';
import type { Place } from '@/lib/types';

export default function EditGroup() {
  const { groupCode } = useParams<{ groupCode: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedPlaceCodes, setSelectedPlaceCodes] = useState<string[]>([]);

  const [places, setPlaces] = useState<Place[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchGroup = useCallback(async () => {
    if (!groupCode) return;
    setLoading(true);
    try {
      const [g, members] = await Promise.all([getGroup(groupCode), getGroupMembers(groupCode)]);

      const isAdmin = members.some((m) => m.user_code === user?.user_code && m.role === 'admin');
      if (!isAdmin) {
        navigate(`/groups/${groupCode}`);
        return;
      }

      setName(g.name);
      setDescription(g.description ?? '');
      setIsPrivate(g.is_private);
      setCoverImageUrl(g.cover_image_url ?? '');
      setStartDate(g.start_date ?? '');
      setEndDate(g.end_date ?? '');
      setSelectedPlaceCodes(g.path_place_codes ?? []);
    } catch {
      navigate(`/groups/${groupCode}`);
    } finally {
      setLoading(false);
    }
  }, [groupCode, user?.user_code, navigate]);

  useEffect(() => {
    fetchGroup();
    setPlacesLoading(true);
    getPlaces({ limit: 200 })
      .then((res) => setPlaces(res.places ?? []))
      .catch(() => {})
      .finally(() => setPlacesLoading(false));
  }, [fetchGroup]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupCode || !name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await updateGroup(groupCode, {
        name: name.trim(),
        description: description.trim() || undefined,
        is_private: isPrivate,
        path_place_codes: selectedPlaceCodes,
        cover_image_url: coverImageUrl.trim() || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      navigate(`/groups/${groupCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="material-symbols-outlined animate-spin text-primary text-3xl">
          progress_activity
        </span>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 dark:bg-dark-bg min-h-screen">
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => navigate(`/groups/${groupCode}`)}
          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-dark-surface"
        >
          <span className="material-symbols-outlined text-slate-600 dark:text-white">
            arrow_back
          </span>
        </button>
        <h1 className="text-xl font-bold text-text-main dark:text-white">
          {t('groups.editGroup')}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-text-main dark:text-white mb-1">
            {t('groups.nameLabel')} *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full border border-input-border dark:border-dark-border rounded-xl px-4 py-3 text-text-main dark:text-white bg-surface dark:bg-dark-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-main dark:text-white mb-1">
            {t('groups.descriptionLabel')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full border border-input-border dark:border-dark-border rounded-xl px-4 py-3 text-text-main dark:text-white bg-surface dark:bg-dark-surface focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-main dark:text-white mb-1">
            {t('groups.coverImage')}
          </label>
          <input
            type="url"
            value={coverImageUrl}
            onChange={(e) => setCoverImageUrl(e.target.value)}
            placeholder={t('groups.coverImagePlaceholder')}
            className="w-full border border-input-border dark:border-dark-border rounded-xl px-4 py-3 text-text-main dark:text-white bg-surface dark:bg-dark-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-text-main dark:text-white mb-1">
              {t('groups.startDate')}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-input-border dark:border-dark-border rounded-xl px-3 py-3 text-text-main dark:text-white bg-surface dark:bg-dark-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-main dark:text-white mb-1">
              {t('groups.endDate')}
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-input-border dark:border-dark-border rounded-xl px-3 py-3 text-text-main dark:text-white bg-surface dark:bg-dark-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <label className="flex items-center gap-3 p-3 border border-input-border dark:border-dark-border rounded-xl cursor-pointer hover:bg-soft-blue dark:hover:bg-dark-surface">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="rounded border-input-border text-primary"
          />
          <span className="text-text-main dark:text-white text-sm">{t('groups.privateGroup')}</span>
        </label>

        <div>
          <label className="block text-sm font-medium text-text-main dark:text-white mb-2">
            {t('groups.itinerary')}
          </label>
          <PlaceSelector
            selectedCodes={selectedPlaceCodes}
            onChange={setSelectedPlaceCodes}
            places={places}
            loading={placesLoading}
          />
        </div>

        {error && (
          <p className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(`/groups/${groupCode}`)}
            className="flex-1 py-3 rounded-xl border border-input-border dark:border-dark-border text-text-main dark:text-white font-medium"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="flex-1 py-3 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover disabled:opacity-50"
          >
            {submitting ? t('common.loading') : t('groups.saveChanges')}
          </button>
        </div>
      </form>
    </div>
  );
}
