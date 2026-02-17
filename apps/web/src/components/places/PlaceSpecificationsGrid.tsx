import React from 'react';
import type { PlaceSpecification } from '@/lib/types';

interface Props {
  specifications: PlaceSpecification[];
  t: (key: string) => string;
  compact?: boolean; // true = mobile style with section header chip
}

function PlaceSpecificationsGrid({ specifications, t, compact = false }: Props) {
  const header = compact ? (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-1.5 h-6 bg-primary rounded-full" />
      <h2 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
        {t('placeDetail.detailsAndFacilities')}
      </h2>
    </div>
  ) : (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-1.5 h-6 bg-primary rounded-full" />
      <h2 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
        {t('placeDetail.detailsAndFacilities')}
      </h2>
    </div>
  );

  return (
    <section className="mb-12">
      {header}
      <div className={`grid grid-cols-2 ${compact ? '' : 'lg:grid-cols-3'} gap-4`}>
        {specifications.map((spec, i) => (
          <div
            key={i}
            className={`p-4 rounded-3xl bg-white dark:bg-dark-surface border border-slate-100 dark:border-dark-border shadow-soft flex flex-col gap-2 ${compact ? '' : 'hover:border-primary/20 hover:shadow-lg transition-all'}`}
          >
            <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-dark-bg flex items-center justify-center text-slate-400 dark:text-slate-500 mb-1">
              <span className="material-symbols-outlined text-[20px]">{spec.icon}</span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {t(spec.label)}
            </p>
            <p className="text-[13px] font-bold text-slate-800 dark:text-white">{spec.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default React.memo(PlaceSpecificationsGrid);
