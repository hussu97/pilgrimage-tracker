'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils/cn';

interface Props {
  opening_hours: Record<string, string>;
  opening_hours_today?: string | null;
  t: (key: string) => string;
  compact?: boolean; // true = mobile style, false = desktop style (default: false)
}

const DAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
const DAY_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function PlaceOpeningHours({ opening_hours, opening_hours_today, t, compact = false }: Props) {
  const [expanded, setExpanded] = useState(false);

  const formatHours = (hours: string | undefined) => {
    if (!hours) return t('places.hoursNotAvailable');
    if (hours.toLowerCase() === 'closed') return t('places.closed');
    if (hours === 'OPEN_24_HOURS' || hours === '00:00-23:59') return t('places.open24Hours');
    if (hours.toLowerCase() === 'hours not available') return t('places.hoursNotAvailable');
    return hours;
  };

  if (compact) {
    return (
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-1.5 h-6 bg-primary rounded-full" />
          <h2 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
            {t('places.openingHours')}
          </h2>
        </div>
        <div className="rounded-[2rem] border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-6 shadow-soft">
          {!expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">schedule</span>
                <span className="text-sm font-semibold text-text-main">{t('places.today')}:</span>
                <span className="text-sm text-text-secondary truncate min-w-0">
                  {formatHours(opening_hours_today ?? undefined)}
                </span>
              </div>
              <span className="material-symbols-outlined text-text-muted text-[20px]">
                expand_more
              </span>
            </button>
          ) : (
            <div className="space-y-3">
              {DAY_KEYS.map((key, i) => {
                const dayEn = DAY_EN[i];
                const isToday = opening_hours_today && opening_hours[dayEn] === opening_hours_today;
                return (
                  <div
                    key={key}
                    className={cn(
                      'flex items-center justify-between py-2',
                      isToday
                        ? 'font-semibold text-primary'
                        : 'text-text-secondary dark:text-dark-text-secondary',
                    )}
                  >
                    <span className="text-sm">{t(`common.${key}`)}</span>
                    <span className="text-sm text-right max-w-[50%] truncate">
                      {formatHours(opening_hours[dayEn])}
                    </span>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="w-full flex items-center justify-center gap-2 pt-2 text-sm font-semibold text-primary hover:text-primary-hover"
              >
                <span>{t('common.showLess')}</span>
                <span className="material-symbols-outlined text-[20px]">expand_less</span>
              </button>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-xl font-bold text-text-main mb-4">{t('places.openingHours')}</h2>
      <div className="rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-5">
        {!expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[22px]">schedule</span>
              <span className="text-sm font-semibold text-text-main dark:text-white">
                {t('places.today')}:
              </span>
              <span className="text-sm text-text-secondary dark:text-dark-text-secondary">
                {opening_hours_today || t('places.hoursNotAvailable')}
              </span>
            </div>
            <span className="material-symbols-outlined text-text-muted dark:text-dark-text-secondary text-[22px]">
              expand_more
            </span>
          </button>
        ) : (
          <div className="space-y-3">
            {DAY_KEYS.map((key, i) => {
              const dayEn = DAY_EN[i];
              const isToday = opening_hours_today && opening_hours[dayEn] === opening_hours_today;
              return (
                <div
                  key={key}
                  className={cn(
                    'flex items-center justify-between py-2',
                    isToday
                      ? 'font-semibold text-primary'
                      : 'text-text-secondary dark:text-dark-text-secondary',
                  )}
                >
                  <span className="text-sm">{t(`common.${key}`)}</span>
                  <span className="text-sm">{formatHours(opening_hours[dayEn])}</span>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="w-full flex items-center justify-center gap-2 pt-2 text-sm font-semibold text-primary hover:text-primary-hover"
            >
              <span>{t('common.showLess')}</span>
              <span className="material-symbols-outlined text-[22px]">expand_less</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export default React.memo(PlaceOpeningHours);
