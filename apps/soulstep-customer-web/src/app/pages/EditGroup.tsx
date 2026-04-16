'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from '@/lib/navigation';
import { useAuth, useFeedback, useI18n } from '@/app/providers';
import { cn } from '@/lib/utils/cn';
import { getGroup, updateGroup, getGroupMembers, uploadGroupCover } from '@/lib/api/client';
import { getFullImageUrl } from '@/lib/utils/imageUtils';

export default function EditGroup() {
  const { groupCode } = useParams<{ groupCode: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user } = useAuth();
  const { showSuccess, showError } = useFeedback();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [placeCount, setPlaceCount] = useState(0);

  const [nameError, setNameError] = useState('');
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
      if (g.cover_image_url) setCoverPreview(getFullImageUrl(g.cover_image_url));
      setStartDate(g.start_date ?? '');
      setEndDate(g.end_date ?? '');
      setPlaceCount((g.path_place_codes ?? []).length);
    } catch {
      navigate(`/groups/${groupCode}`);
    } finally {
      setLoading(false);
    }
  }, [groupCode, user?.user_code, navigate]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);

  const handleCoverPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    const reader = new FileReader();
    reader.onload = () => setCoverPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const removeCover = () => {
    setCoverFile(null);
    setCoverPreview(null);
    setCoverImageUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupCode) return;
    if (!name.trim()) {
      setNameError(t('groups.nameRequired'));
      return;
    }
    setNameError('');
    setSubmitting(true);
    setError('');
    try {
      let finalCoverUrl = coverImageUrl.trim() || undefined;

      if (coverFile) {
        try {
          const result = await uploadGroupCover(coverFile);
          finalCoverUrl = result.url;
        } catch (err) {
          setError(err instanceof Error ? err.message : t('common.error'));
          showError(t('feedback.error'));
          setSubmitting(false);
          return;
        }
      }

      // If cover was removed, explicitly send empty string
      if (!coverPreview && !coverFile) {
        finalCoverUrl = '';
      }

      await updateGroup(groupCode, {
        name: name.trim(),
        description: description.trim() || undefined,
        is_private: isPrivate,
        cover_image_url: finalCoverUrl,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      showSuccess(t('feedback.groupUpdated'));
      navigate(`/groups/${groupCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      showError(t('feedback.error'));
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

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Cover Image Picker */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleCoverPick}
        />
        {coverPreview ? (
          <div className="relative w-full h-44 rounded-xl overflow-hidden">
            <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center gap-2 opacity-0 hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-white/90 text-slate-700 text-xs font-semibold flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">edit</span>
                {t('groups.changeCoverPhoto')}
              </button>
              <button
                type="button"
                onClick={removeCover}
                className="px-3 py-1.5 rounded-lg bg-white/90 text-red-600 text-xs font-semibold flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">close</span>
                {t('groups.removeCoverPhoto')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-44 rounded-xl border-2 border-dashed border-slate-300 dark:border-dark-border bg-slate-50 dark:bg-dark-surface flex flex-col items-center justify-center gap-2 hover:border-primary hover:bg-primary/5 dark:hover:bg-primary/10 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-3xl text-slate-400 dark:text-dark-text-secondary">
              photo_camera
            </span>
            <span className="text-sm font-medium text-slate-500 dark:text-dark-text-secondary">
              {t('groups.addCoverPhoto')}
            </span>
            <span className="text-xs text-slate-400 dark:text-dark-text-secondary">
              {t('groups.optional')}
            </span>
          </button>
        )}

        <div>
          <label className="block text-sm font-semibold text-slate-600 dark:text-dark-text-secondary mb-1.5">
            {t('groups.nameLabel')} *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError('');
            }}
            className={cn(
              'w-full h-12 border rounded-xl px-4 text-text-main dark:text-white bg-surface dark:bg-dark-surface focus:outline-none focus:ring-2 focus:ring-primary/30',
              nameError
                ? 'border-red-400 dark:border-red-500'
                : 'border-input-border dark:border-dark-border',
            )}
          />
          {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-600 dark:text-dark-text-secondary mb-1.5">
            {t('groups.descriptionLabel')} {t('groups.optional')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full border border-input-border dark:border-dark-border rounded-xl px-4 py-3 text-text-main dark:text-white bg-surface dark:bg-dark-surface focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-slate-600 dark:text-dark-text-secondary mb-1.5">
              {t('groups.startDate')} {t('groups.optional')}
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">
                calendar_today
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-12 border border-input-border dark:border-dark-border rounded-xl pl-10 pr-3 text-text-main dark:text-white bg-surface dark:bg-dark-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600 dark:text-dark-text-secondary mb-1.5">
              {t('groups.endDate')} {t('groups.optional')}
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">
                calendar_today
              </span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-12 border border-input-border dark:border-dark-border rounded-xl pl-10 pr-3 text-text-main dark:text-white bg-surface dark:bg-dark-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
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

        {/* Manage Itinerary button */}
        <button
          type="button"
          onClick={() => navigate(`/groups/${groupCode}/edit-places`)}
          className="w-full h-12 rounded-xl border border-input-border dark:border-dark-border text-text-main dark:text-white font-medium flex items-center justify-center gap-2 hover:bg-soft-blue dark:hover:bg-dark-surface transition-colors"
        >
          <span className="material-symbols-outlined text-lg">edit_note</span>
          {t('groups.manageItinerary')}
          {placeCount > 0 && (
            <span className="text-xs text-slate-400 dark:text-dark-text-secondary">
              ({placeCount})
            </span>
          )}
        </button>

        {error && (
          <p className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(`/groups/${groupCode}`)}
            className="flex-1 h-12 rounded-xl border border-input-border dark:border-dark-border text-text-main dark:text-white font-medium"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="flex-1 h-12 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover disabled:opacity-50"
          >
            {submitting ? t('common.loading') : t('groups.saveChanges')}
          </button>
        </div>
      </form>
    </div>
  );
}
