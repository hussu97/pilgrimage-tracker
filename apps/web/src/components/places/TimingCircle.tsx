import type { PlaceTiming } from '@/lib/types';

interface TimingCircleProps {
  item: PlaceTiming;
}

export function TimingCircle({ item }: TimingCircleProps) {
  const isCurrent = item.status === 'current';
  const isPast = item.status === 'past';

  return (
    <div className="flex flex-col items-center gap-2 min-w-[84px] group">
      <div
        className={`w-[80px] h-[80px] rounded-full border-2 flex flex-col items-center justify-center p-1 transition-all duration-300 transform group-hover:scale-105 active:scale-95 relative ${
          isCurrent
            ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20'
            : isPast
              ? 'border-slate-100 bg-white opacity-60'
              : 'border-slate-200 bg-white shadow-soft'
        }`}
      >
        <span
          className={`text-[10px] font-bold uppercase tracking-tighter leading-tight text-center ${
            isCurrent ? 'text-primary' : isPast ? 'text-text-muted' : 'text-text-secondary'
          }`}
        >
          {item.name}
        </span>
        {item.time && (
          <span
            className={`text-[14px] font-black leading-tight text-center mt-0.5 ${
              isCurrent ? 'text-primary' : isPast ? 'text-text-muted' : 'text-text-main'
            }`}
          >
            {item.time}
          </span>
        )}
        {isCurrent && (
          <div className="absolute -bottom-1 w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-white shadow-lg" />
        )}
        {isPast && (
          <span className="material-symbols-outlined text-[12px] text-text-muted mt-0.5">check</span>
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
