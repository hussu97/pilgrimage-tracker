import React from 'react';
import { TimingCircle, DeityCircle } from '@/components/places';
import type { PlaceTiming } from '@/lib/types';

interface Props {
  timings: PlaceTiming[];
  title: string;
  compact?: boolean; // true = mobile style with section header chip
}

function PlaceTimingsCarousel({ timings, title, compact = false }: Props) {
  if (compact) {
    return (
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1.5 h-6 bg-primary rounded-full" />
          <h2 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
            {title}
          </h2>
        </div>
        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
          {timings.map((item, i) =>
            item.type === 'deity' ? <DeityCircle key={i} item={item} /> : <TimingCircle key={i} item={item} />
          )}
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-xl font-bold text-text-main mb-4">{title}</h2>
      <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2">
        {timings.map((item, i) =>
          item.type === 'deity' ? <DeityCircle key={i} item={item} /> : <TimingCircle key={i} item={item} />
        )}
      </div>
    </section>
  );
}

export default React.memo(PlaceTimingsCarousel);
