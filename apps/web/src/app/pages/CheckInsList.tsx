import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '@/app/providers';
import { cn } from '@/lib/utils/cn';
import { getMyCheckIns, getOnThisDayCheckIns, getThisMonthCheckIns } from '@/lib/api/client';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import type { CheckIn } from '@/lib/types';

/** Get locale-aware single-letter weekday abbreviations starting from Sunday. */
function getWeekdayLabels(locale: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(2023, 0, 1 + i); // 2023-01-01 is a Sunday
    return new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(date);
  });
}

function getDatesWithCheckIns(checkIns: CheckIn[]): Set<string> {
  const set = new Set<string>();
  checkIns.forEach((c) => {
    if (c.checked_in_at) {
      const d = new Date(c.checked_in_at);
      set.add(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      );
    }
  });
  return set;
}

function getMonthDays(year: number, month: number): { date: Date; isCurrent: boolean }[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const days: { date: Date; isCurrent: boolean }[] = [];
  const prevMonth = new Date(year, month, 0);
  const prevCount = prevMonth.getDate();
  for (let i = startPad - 1; i >= 0; i--) {
    days.push({ date: new Date(year, month - 1, prevCount - i), isCurrent: false });
  }
  for (let d = 1; d <= last.getDate(); d++) {
    days.push({ date: new Date(year, month, d), isCurrent: true });
  }
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    days.push({ date: new Date(year, month + 1, d), isCurrent: false });
  }
  return days;
}

function CheckInCard({ c }: { c: CheckIn }) {
  return (
    <Link
      to={`/places/${c.place_code}`}
      className="bg-white dark:bg-dark-surface rounded-[1.5rem] p-4 shadow-subtle border border-slate-100 dark:border-dark-border flex gap-4 h-32 items-center group hover:shadow-lg transition-all"
    >
      <div className="w-24 h-24 rounded-2xl overflow-hidden flex-shrink-0 relative bg-slate-100 dark:bg-dark-border">
        {c.place_image_url || c.place?.images?.[0]?.url ? (
          <img
            src={getFullImageUrl(c.place_image_url || c.place?.images?.[0]?.url)}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400">
            <span className="material-symbols-outlined text-2xl">place</span>
          </div>
        )}
        {c.place?.average_rating ? (
          <div className="absolute bottom-1 right-1 bg-primary px-1.5 py-0.5 rounded-lg flex items-center gap-0.5">
            <span
              className="material-symbols-outlined text-white text-[10px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              star
            </span>
            <span className="text-[10px] font-bold text-white">
              {c.place.average_rating.toFixed(1)}
            </span>
          </div>
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-medium text-slate-800 dark:text-white leading-tight truncate">
          {c.place?.name ?? c.place_name ?? c.place_code}
        </h3>
        <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-400 font-light">
          <span className="material-symbols-outlined text-[12px] text-primary">calendar_today</span>
          <span>
            {c.checked_in_at
              ? new Date(c.checked_in_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : (c.date ?? '')}
          </span>
          {c.time && (
            <>
              <span className="mx-1">·</span>
              <span>{c.time}</span>
            </>
          )}
        </div>
        {(c.location || c.place?.address) && (
          <div className="flex items-center gap-2 mt-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 dark:bg-primary/20 text-primary-dark dark:text-primary">
              <span className="material-symbols-outlined text-[10px] mr-1">location_on</span>
              {(c.location || c.place?.address || '').split(',')[0].trim()}
            </span>
          </div>
        )}
      </div>
      <span className="material-symbols-outlined text-slate-300 group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0">
        chevron_right
      </span>
    </Link>
  );
}

export default function CheckInsList() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [onThisDay, setOnThisDay] = useState<CheckIn[]>([]);
  const [thisMonth, setThisMonth] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });

  const fetchList = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      getMyCheckIns(),
      getOnThisDayCheckIns().catch(() => [] as CheckIn[]),
      getThisMonthCheckIns().catch(() => [] as CheckIn[]),
    ])
      .then(([all, otd, tm]) => {
        setCheckIns(all);
        setOnThisDay(otd);
        setThisMonth(tm);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const weekdayLabels = useMemo(() => getWeekdayLabels(locale), [locale]);
  const datesSet = useMemo(() => getDatesWithCheckIns(checkIns), [checkIns]);
  const totalCount = checkIns.length;
  const now = new Date();

  const monthLabel = useMemo(
    () =>
      new Date(calendarMonth.year, calendarMonth.month).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
    [calendarMonth],
  );
  const monthDays = useMemo(
    () => getMonthDays(calendarMonth.year, calendarMonth.month),
    [calendarMonth],
  );

  const goPrevMonth = () => {
    setCalendarMonth((m) => {
      if (m.month === 0) return { year: m.year - 1, month: 11 };
      return { year: m.year, month: m.month - 1 };
    });
  };
  const goNextMonth = () => {
    setCalendarMonth((m) => {
      if (m.month === 11) return { year: m.year + 1, month: 0 };
      return { year: m.year, month: m.month + 1 };
    });
  };

  const dateKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hasCheckIn = (d: Date) => datesSet.has(dateKey(d));
  const isToday = (d: Date) => dateKey(d) === dateKey(now);

  const recentCheckIns = useMemo(
    () =>
      [...checkIns]
        .sort((a, b) => (b.checked_in_at || '').localeCompare(a.checked_in_at || ''))
        .slice(0, 10),
    [checkIns],
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-bg">
      <div className="absolute top-0 left-0 w-full h-80 bg-gradient-to-b from-blue-50 to-transparent dark:from-primary/5 dark:to-transparent pointer-events-none z-0" />

      <header className="relative z-10 px-8 pt-12 pb-6">
        <div className="mb-8">
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="flex items-center gap-2 text-slate-400 hover:text-primary mb-6 text-sm font-bold uppercase tracking-[0.1em]"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            {t('common.back')}
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1.5 h-6 bg-primary rounded-full"></div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              {t('journey.journeyLog')}
            </h1>
          </div>
          <p className="text-slate-500 dark:text-dark-text-secondary font-medium pl-4">
            {t('checkins.journeySubtitle') || 'Reflecting on your spiritual milestones'}
          </p>
        </div>

        {loading && (
          <div className="flex justify-center py-10">
            <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 p-4 rounded-2xl mb-8">
            <p className="text-red-600 dark:text-red-400 mb-3 text-sm font-medium">{error}</p>
            <button
              type="button"
              onClick={fetchList}
              className="text-primary font-bold text-sm underline"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {/* Stats card */}
        {!loading && !error && (
          <div className="bg-white dark:bg-dark-surface rounded-3xl p-6 shadow-soft border border-slate-100 dark:border-dark-border flex items-center justify-between relative overflow-hidden">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
            <div className="z-10">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                {t('journey.totalVisits')}
              </span>
              <div className="flex items-baseline mt-1 gap-2">
                <span className="text-5xl font-bold text-primary tracking-tighter">
                  {totalCount}
                </span>
                <span className="text-sm text-slate-400 dark:text-slate-500 font-medium">
                  {t('journey.sacredPlaces')}
                </span>
              </div>
            </div>
            <div className="h-12 w-px bg-slate-100 dark:bg-dark-border mx-4 z-10" />
            <div className="text-right z-10">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] block mb-1">
                {t('checkins.thisMonth')}
              </span>
              <span className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                {thisMonth.length}
              </span>
            </div>
          </div>
        )}
      </header>

      {!loading && !error && checkIns.length === 0 && (
        <div className="px-6 py-12 text-center">
          <div className="rounded-2xl border border-input-border bg-white dark:bg-dark-surface py-12 shadow-subtle">
            <span className="material-symbols-outlined text-5xl text-text-muted mb-3 block">
              location_off
            </span>
            <p className="text-text-muted mb-4 text-sm">{t('profile.noCheckInsYet')}</p>
            <Link
              to="/home"
              className="inline-block py-2 px-5 rounded-2xl bg-primary text-white text-sm font-medium"
            >
              {t('profile.exploreCta')}
            </Link>
          </div>
        </div>
      )}

      {!loading && !error && checkIns.length > 0 && (
        <>
          {/* On This Day */}
          {onThisDay.length > 0 && (
            <section className="px-6 mb-8">
              <div className="flex items-center gap-3 mb-6">
                <span
                  className="material-symbols-outlined text-primary text-2xl"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  auto_stories
                </span>
                <div>
                  <h2 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-1">
                    {t('checkins.onThisDay')}
                  </h2>
                  <p className="text-[13px] text-slate-500 dark:text-dark-text-secondary font-medium">
                    {t('checkins.onThisDayDescription')}
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                {onThisDay.map((c) => (
                  <CheckInCard key={c.check_in_code} c={c} />
                ))}
              </div>
            </section>
          )}

          {/* Calendar */}
          <section className="px-6 mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {monthLabel}
              </h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={goPrevMonth}
                  className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-dark-surface transition-colors"
                  aria-label="Previous month"
                >
                  <span className="material-symbols-outlined text-slate-400 text-sm">
                    chevron_left
                  </span>
                </button>
                <button
                  type="button"
                  onClick={goNextMonth}
                  className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-dark-surface transition-colors"
                  aria-label="Next month"
                >
                  <span className="material-symbols-outlined text-slate-400 text-sm">
                    chevron_right
                  </span>
                </button>
              </div>
            </div>
            <div className="bg-white dark:bg-dark-surface rounded-[1.5rem] p-4 shadow-subtle border border-slate-100 dark:border-dark-border">
              <div className="grid grid-cols-7 gap-y-4 text-center text-xs mb-2">
                {weekdayLabels.map((l, i) => (
                  <span key={i} className="text-slate-400 font-medium">
                    {l}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-3 text-center text-sm">
                {monthDays.map(({ date, isCurrent }, i) => {
                  const has = hasCheckIn(date);
                  const today = isCurrent && isToday(date);
                  return (
                    <div
                      key={i}
                      className={cn(
                        'py-2 relative flex items-center justify-center',
                        !isCurrent ? 'text-slate-300' : 'text-slate-800 dark:text-white',
                      )}
                    >
                      {has && (
                        <span
                          className={cn(
                            'absolute w-8 h-8 rounded-full z-0',
                            today
                              ? 'bg-primary shadow-md shadow-blue-200'
                              : 'bg-blue-50 dark:bg-primary/20',
                          )}
                        />
                      )}
                      <span
                        className={cn(
                          'relative z-10',
                          has && 'font-semibold text-primary',
                          today && 'text-white',
                        )}
                      >
                        {date.getDate()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* This Month */}
          {thisMonth.length > 0 && (
            <section className="px-6 mb-8">
              <div className="flex items-center gap-3 mb-6">
                <span
                  className="material-symbols-outlined text-primary text-2xl"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  calendar_month
                </span>
                <h2 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                  {t('checkins.thisMonth')}
                </h2>
              </div>
              <div className="space-y-3">
                {thisMonth.map((c) => (
                  <CheckInCard key={c.check_in_code} c={c} />
                ))}
              </div>
            </section>
          )}

          {/* All recent visits */}
          <section className="px-6 space-y-3 pb-24">
            <h2 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
              {t('journey.recentVisits')}
            </h2>
            {recentCheckIns.map((c) => (
              <CheckInCard key={c.check_in_code} c={c} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
