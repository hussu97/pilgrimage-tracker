'use client';

import type { PlaceTiming } from '@/lib/types';
import PlaceImage from './PlaceImage';

interface DeityCircleProps {
  item: PlaceTiming;
}

export function DeityCircle({ item }: DeityCircleProps) {
  return (
    <div className="flex flex-col items-center gap-2 min-w-[84px] group">
      <div className="w-[80px] h-[80px] rounded-full border-2 border-amber-200/60 bg-white overflow-hidden flex items-center justify-center transition-all duration-300 transform group-hover:scale-105 shadow-soft">
        <PlaceImage
          src={item.image_url}
          alt={item.name}
          kind="deity"
          className="w-full h-full object-cover"
          decorativeFallback={false}
        />
      </div>
      <span className="text-[12px] font-bold text-text-main text-center leading-tight mt-1">
        {item.name}
      </span>
      {item.subtitle ? (
        <span className="text-[10px] text-text-muted font-bold uppercase tracking-widest text-center scale-90">
          {item.subtitle}
        </span>
      ) : null}
    </div>
  );
}
