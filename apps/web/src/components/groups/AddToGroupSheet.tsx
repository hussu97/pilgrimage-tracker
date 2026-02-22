import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getGroups, addPlaceToGroup } from '@/lib/api/client';
import { useFeedback } from '@/app/providers';
import type { Group } from '@/lib/types';
import { cn } from '@/lib/utils/cn';

interface AddToGroupSheetProps {
  placeCode: string;
  placeName: string;
  onClose: () => void;
  t: (key: string) => string;
}

export default function AddToGroupSheet({
  placeCode,
  placeName: _placeName,
  onClose,
  t,
}: AddToGroupSheetProps) {
  const { showSuccess, showError } = useFeedback();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getGroups()
      .then(setGroups)
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (groupCode: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(groupCode)) next.delete(groupCode);
      else next.add(groupCode);
      return next;
    });
  };

  const handleAdd = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      await Promise.all([...selected].map((gc) => addPlaceToGroup(gc, placeCode)));
      showSuccess(t('groups.placeAdded'));
      onClose();
    } catch {
      showError(t('feedback.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[1100] bg-black/50" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-[1200] max-w-lg mx-auto bg-white dark:bg-dark-surface rounded-t-3xl shadow-2xl p-6 animate-in slide-in-from-bottom-4 duration-300">
        {/* Handle */}
        <div className="w-10 h-1 bg-slate-200 dark:bg-dark-border rounded-full mx-auto mb-5" />

        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
          {t('groups.selectGroups')}
        </h2>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-slate-500 dark:text-dark-text-secondary text-sm mb-4">
              {t('groups.noGroupsYetShort')}
            </p>
            <Link
              to="/groups/create"
              className="inline-block bg-primary text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-primary-hover transition-colors"
              onClick={onClose}
            >
              {t('groups.create')}
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-5">
              {groups.map((g) => {
                const alreadyIn = g.path_place_codes?.includes(placeCode);
                const isChecked = selected.has(g.group_code);
                return (
                  <button
                    key={g.group_code}
                    disabled={!!alreadyIn}
                    onClick={() => !alreadyIn && toggle(g.group_code)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-2xl border transition-all text-left',
                      alreadyIn
                        ? 'border-slate-100 dark:border-dark-border opacity-50 cursor-not-allowed bg-slate-50 dark:bg-dark-bg'
                        : isChecked
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-slate-100 dark:border-dark-border hover:border-slate-300 bg-white dark:bg-dark-surface',
                    )}
                  >
                    {/* Checkbox */}
                    <div
                      className={cn(
                        'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors',
                        alreadyIn
                          ? 'border-slate-300 dark:border-dark-border bg-slate-100 dark:bg-dark-bg'
                          : isChecked
                            ? 'border-primary bg-primary'
                            : 'border-slate-300 dark:border-dark-border',
                      )}
                    >
                      {(isChecked || alreadyIn) && (
                        <span className="material-symbols-outlined text-white text-[14px]">
                          check
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">
                        {g.name}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-dark-text-secondary">
                        {g.member_count ?? 0} members
                        {alreadyIn && (
                          <span className="ml-2 text-primary font-medium">
                            · {t('groups.placeAlreadyAdded')}
                          </span>
                        )}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              disabled={selected.size === 0 || submitting}
              onClick={handleAdd}
              className="w-full bg-primary text-white font-bold py-3.5 rounded-2xl hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
            >
              {submitting ? '...' : t('groups.addPlace')}
            </button>
          </>
        )}
      </div>
    </>
  );
}
