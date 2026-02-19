import { useState } from 'react';
import Modal from '@/components/common/Modal';
import { useI18n } from '@/app/providers';
import type { FilterOption } from '@/lib/types';

interface FilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  options: FilterOption[];
  activeFilters: Record<string, boolean>;
  onApply: (filters: Record<string, boolean>) => void;
}

export default function FilterSheet({
  isOpen,
  onClose,
  options,
  activeFilters,
  onApply,
}: FilterSheetProps) {
  const { t } = useI18n();
  const [pending, setPending] = useState<Record<string, boolean>>(activeFilters);

  const toggle = (key: string) => {
    setPending((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleApply = () => {
    onApply(pending);
    onClose();
  };

  const handleClear = () => {
    const cleared = Object.keys(pending).reduce(
      (acc, key) => {
        acc[key] = false;
        return acc;
      },
      {} as Record<string, boolean>,
    );
    setPending(cleared);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('home.filters') || 'Filters'}
      footer={
        <div className="flex gap-4">
          <button
            onClick={handleClear}
            className="flex-1 py-3 px-4 rounded-xl border border-input-border dark:border-dark-border text-text-main dark:text-white font-semibold hover:bg-slate-50 dark:hover:bg-dark-bg transition-colors"
          >
            {t('common.clear') || 'Clear'}
          </button>
          <button
            onClick={handleApply}
            className="flex-1 py-3 px-4 rounded-xl bg-primary text-white font-semibold hover:bg-primary-hover transition-colors shadow-lg shadow-primary/20"
          >
            {t('common.apply') || 'Apply'}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <div>
          <h3 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] mb-4 ml-1">
            {t('home.refineSearch') || 'Refine Search'}
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {options.map((option) => {
              const isActive = !!pending[option.key];
              return (
                <button
                  key={option.key}
                  onClick={() => toggle(option.key)}
                  className={`flex items-center justify-between p-4 rounded-2xl border transition-all duration-200 ${
                    isActive
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-slate-100 dark:border-dark-border hover:border-slate-300 bg-white dark:bg-dark-surface'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                        isActive
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 dark:bg-dark-bg text-slate-500 dark:text-dark-text-secondary'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px]">{option.icon}</span>
                    </div>
                    <div className="text-left">
                      <span
                        className={`block font-semibold ${isActive ? 'text-primary' : 'text-text-main'}`}
                      >
                        {option.label}
                      </span>
                      {option.count !== undefined && (
                        <span className="text-xs text-text-muted">
                          {option.count} {t('home.places') || 'places'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                      isActive
                        ? 'border-primary bg-primary'
                        : 'border-slate-200 dark:border-dark-border'
                    }`}
                  >
                    {isActive && (
                      <span className="material-symbols-outlined text-white text-[16px] font-bold">
                        check
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
