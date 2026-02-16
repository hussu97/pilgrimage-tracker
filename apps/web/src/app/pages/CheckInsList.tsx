import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '@/app/providers';
import { getMyCheckIns, getOnThisDayCheckIns, getThisMonthCheckIns } from '@/lib/api/client';
import type { CheckIn } from '@/lib/types';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function getDatesWithCheckIns(checkIns: CheckIn[]): Set<string> {
  const set = new Set<string>();
  checkIns.forEach((c) => {
    if (c.checked_in_at) {
      const d = new Date(c.checked_in_at);
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
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
      className="bg-white dark:bg-dark-surface rounded-[1.5rem] p-4 shadow-subtle border border-slate-100 dark:border-dark-border flex gap-4 items-center group hover:shadow-lg transition-all"
    >
      <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 bg-slate-100 dark:bg-dark-border">
        {(c.place_image_url || c.place?.images?.[0]?.url) ? (
          <img
            src={c.place_image_url || c.place?.images?.[0]?.url}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400">
            <span className="material-symbols-outlined text-2xl">place</span>
          </div>
        )}
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
              : c.date ?? ''}
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
      <span className="material-symbols-outlined text-slate-300 group-hover:text-primary flex-shrink-0">
        chevron_right
      </span>
    </Link>
  );
}

export default function CheckInsList() {
  const { t } = useI18n();
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

  const datesSet = useMemo(() => getDatesWithCheckIns(checkIns), [checkIns]);
  const totalCount = checkIns.length;
  const now = new Date();

  const monthLabel = useMemo(
    () =>
      new Date(calendarMonth.year, calendarMonth.month).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
    [calendarMonth]
  );
  const monthDays = useMemo(
    () => getMonthDays(calendarMonth.year, calendarMonth.month),
    [calendarMonth]
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
    () => [...checkIns].sort((a, b) => (b.checked_in_at || '').localeCompare(a.checked_in_at || '')).slice(0, 10),
    [checkIns]
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EBF5FF] to-white dark:from-dark-bg dark:to-dark-bg">
      <header className="px-6 pt-6 pb-4">
        <div className="flex justify-between items-center mb-6">
          <div>
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="flex items-center gap-2 text-text-muted hover:text-primary mb-2 text-sm"
            >
              <span className="material-symbols-outlined text-lg">arrow_back</span>
              {t('common.back')}
            </button>
            <p className="text-xs text-primary font-semibold tracking-[0.2em] uppercase mb-1">
              {t('profile.myCheckIns')}
            </p>
            <h1 className="text-2xl font-semibold text-slate-800 dark:text-white tracking-tight">
              {t('journey.journeyLog')}
            </h1>
          </div>
        </div>

        {loading && <p className="text-text-muted text-sm py-4">{t('common.loading')}</p>}
        {error && (
          <div className="py-4">
            <p className="text-red-600 mb-2 text-sm">{error}</p>
            <button type="button" onClick={fetchList} className="text-primary font-medium text-sm">
              {t('common.retry')}
            </button>
          </div>
        )}

        {/* Stats card */}
        {!loading && !error && (
          <div className="bg-white dark:bg-dark-surface rounded-[2rem] p-6 shadow-subtle border border-slate-100/50 dark:border-dark-border flex items-center justify-between relative overflow-hidden">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
            <div>
              <span className="text-xs font-medium text-slate-500 dark:text-dark-text-secondary uppercase tracking-wide">
                {t('journey.totalVisits')}
              </span>
              <div className="flex items-baseline mt-1 gap-2">
                <span className="text-5xl font-light text-primary tracking-tighter">{totalCount}</span>
                <span className="text-sm text-slate-400 font-normal">{t('journey.sacredPlaces')}</span>
              </div>
            </div>
            <div className="h-12 w-px bg-slate-100 dark:bg-dark-border mx-4" />
            <div className="text-right">
              <span className="text-xs font-medium text-slate-500 dark:text-dark-text-secondary uppercase tracking-wide block mb-1">
                {t('checkins.thisMonth')}
              </span>
              <span className="text-2xl font-medium text-slate-800 dark:text-white">{thisMonth.length}</span>
            </div>
          </div>
        )}
      </header>

      {!loading && !error && checkIns.length === 0 && (
        <div className="px-6 py-12 text-center">
          <div className="rounded-2xl border border-input-border bg-white dark:bg-dark-surface py-12 shadow-subtle">
            <span className="material-symbols-outlined text-5xl text-text-muted mb-3 block">location_off</span>
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
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-primary text-xl">auto_stories</span>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-white">{t('checkins.onThisDay')}</h2>
              </div>
              <p className="text-xs text-text-muted mb-4">{t('checkins.onThisDayDescription')}</p>
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
              <h2 className="text-lg font-medium text-slate-800 dark:text-white">{monthLabel}</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={goPrevMonth}
                  className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-dark-surface transition-colors"
                  aria-label="Previous month"
                >
                  <span className="material-symbols-outlined text-slate-400 text-sm">chevron_left</span>
                </button>
                <button
                  type="button"
                  onClick={goNextMonth}
                  className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-dark-surface transition-colors"
                  aria-label="Next month"
                >
                  <span className="material-symbols-outlined text-slate-400 text-sm">chevron_right</span>
                </button>
              </div>
            </div>
            <div className="bg-white dark:bg-dark-surface rounded-[1.5rem] p-4 shadow-subtle border border-slate-100 dark:border-dark-border">
              <div className="grid grid-cols-7 gap-y-4 text-center text-xs mb-2">
                {WEEKDAY_LABELS.map((l, i) => (
                  <span key={i} className="text-slate-400 font-medium">{l}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-3 text-center text-sm">
                {monthDays.map(({ date, isCurrent }, i) => {
                  const has = hasCheckIn(date);
                  const today = isCurrent && isToday(date);
                  return (
                    <div
                      key={i}
                      className={`py-2 relative flex items-center justify-center ${
                        !isCurrent ? 'text-slate-300' : 'text-slate-800 dark:text-white'
                      }`}
                    >
                      {has && (
                        <span
                          className={`absolute w-8 h-8 rounded-full z-0 ${
                            today
                              ? 'bg-primary shadow-md shadow-blue-200'
                              : 'bg-blue-50 dark:bg-primary/20'
                          }`}
                        />
                      )}
                      <span
                        className={`relative z-10 ${has ? 'font-semibold text-primary' : ''} ${today ? 'text-white' : ''}`}
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
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-primary text-xl">calendar_month</span>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-white">{t('checkins.thisMonth')}</h2>
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
            <h2 className="text-lg font-medium text-slate-800 dark:text-white mb-2">
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
