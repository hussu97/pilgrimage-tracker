import type { PlaceTiming } from '@/lib/types';
import { cn } from '@/lib/utils/cn';

interface TimingCircleProps {
  item: PlaceTiming;
}

export function TimingCircle({ item }: TimingCircleProps) {
  const isCurrent = item.status === 'current';
  const isPast = item.status === 'past';

  return (
    <div className="flex flex-col items-center gap-2 min-w-[72px] group">
      <div
        className={cn(
          'w-[72px] h-[72px] rounded-full border-2 flex flex-col items-center justify-center p-1 transition-all duration-500 transform group-hover:scale-105 active:scale-95 relative',
          isCurrent
            ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20'
            : isPast
              ? 'border-slate-100 bg-white opacity-40'
              : 'border-slate-200 bg-white shadow-soft',
        )}
      >
        <span
          className={cn(
            'text-[9px] font-bold uppercase tracking-wider leading-tight text-center',
            isCurrent ? 'text-primary' : isPast ? 'text-slate-400' : 'text-slate-500',
          )}
        >
          {item.name}
        </span>
        {item.time && (
          <span
            className={cn(
              'text-sm font-bold leading-tight text-center mt-0.5',
              isCurrent ? 'text-primary' : isPast ? 'text-slate-400' : 'text-slate-900',
            )}
          >
            {item.time}
          </span>
        )}
        {isCurrent && (
          <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-white shadow-md animate-pulse" />
        )}
        {isPast && (
          <span className="material-symbols-outlined text-[10px] text-slate-400 absolute -bottom-1">
            check
          </span>
        )}
      </div>
      {item.subtitle ? (
        <span className="text-[10px] text-text-muted font-bold uppercase tracking-widest text-center mt-1 scale-90">
          {item.subtitle}
        </span>
      ) : null}
    </div>
  );
}
