'use client';

import React, { useState } from 'react';
import { useFeedback, useI18n } from '@/app/providers';
import { checkIn } from '@/lib/api/client';

interface GroupCheckInModalProps {
  groupCode: string;
  placeCode: string;
  placeName: string;
  onClose: () => void;
  onSuccess: () => void;
}

function GroupCheckInModal({
  groupCode,
  placeCode,
  placeName,
  onClose,
  onSuccess,
}: GroupCheckInModalProps) {
  const { t } = useI18n();
  const { showSuccess, showError } = useFeedback();
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await checkIn(placeCode, {
        note: note.trim() || undefined,
        group_code: groupCode,
      });
      showSuccess(t('feedback.groupCheckedIn'));
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.unexpectedError'));
      showError(t('feedback.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      aria-modal="true"
      role="dialog"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full sm:max-w-md bg-white dark:bg-dark-surface rounded-t-2xl sm:rounded-2xl p-6 shadow-xl">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-1">
          {t('groups.checkIn')}
        </h2>
        <p className="text-sm text-slate-500 dark:text-dark-text-secondary mb-4">{placeName}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-dark-text-secondary mb-1">
              {t('groups.notePlaceholder')}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('groups.notePlaceholder')}
              rows={3}
              className="w-full rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-slate-700 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-dark-border text-sm font-semibold text-slate-600 dark:text-dark-text-secondary hover:bg-slate-50 dark:hover:bg-dark-border transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {loading ? t('common.loading') : t('groups.checkIn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default GroupCheckInModal;
