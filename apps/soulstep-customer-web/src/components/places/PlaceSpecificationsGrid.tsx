'use client';

import React from 'react';
import type { PlaceSpecification } from '@/lib/types';
import { cn } from '@/lib/utils/cn';

interface Props {
  specifications: PlaceSpecification[];
  t: (key: string) => string;
  compact?: boolean; // true = mobile style with section header chip
}

/** Returns true when the visitor is on a touch/mobile device */
function isMobileDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;
}

function SpecCard({
  spec,
  t,
  compact,
}: {
  spec: PlaceSpecification;
  t: (key: string) => string;
  compact: boolean;
}) {
  const isPhone = spec.label === 'placeDetail.phone';
  const mobile = isMobileDevice();

  const inner = (
    <>
      <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-dark-bg flex items-center justify-center text-slate-400 dark:text-slate-500 mb-1">
        <span className="material-symbols-outlined text-[20px]">{spec.icon}</span>
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
        {t(spec.label)}
      </p>
      <p
        className={cn(
          'text-[13px] font-bold text-slate-800 dark:text-white',
          isPhone && mobile && 'text-primary underline underline-offset-2',
        )}
      >
        {spec.value}
      </p>
      {isPhone && mobile && (
        <span className="material-symbols-outlined text-[14px] text-primary mt-0.5">call</span>
      )}
    </>
  );

  const baseClass = cn(
    'p-4 rounded-3xl bg-white dark:bg-dark-surface border border-slate-100 dark:border-dark-border shadow-soft flex flex-col gap-2',
    !compact && 'hover:border-primary/20 hover:shadow-lg transition-all',
    isPhone && mobile && 'cursor-pointer active:scale-95 hover:border-primary/30',
  );

  if (isPhone && mobile) {
    return (
      <a href={`tel:${spec.value}`} className={baseClass} aria-label={`Call ${spec.value}`}>
        {inner}
      </a>
    );
  }

  return <div className={baseClass}>{inner}</div>;
}

function PlaceSpecificationsGrid({ specifications, t, compact = false }: Props) {
  return (
    <section className="mb-12">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1.5 h-6 bg-primary rounded-full" />
        <h2 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
          {t('placeDetail.detailsAndFacilities')}
        </h2>
      </div>
      <div className={cn('grid grid-cols-2 gap-4', !compact && 'lg:grid-cols-3')}>
        {specifications.map((spec, i) => (
          <SpecCard key={i} spec={spec} t={t} compact={compact} />
        ))}
      </div>
    </section>
  );
}

export default React.memo(PlaceSpecificationsGrid);
