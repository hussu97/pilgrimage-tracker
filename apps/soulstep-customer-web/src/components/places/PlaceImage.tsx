'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import { cn } from '@/lib/utils/cn';

type PlaceholderKind = 'place' | 'route' | 'city' | 'deity';

interface PlaceImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
  kind?: PlaceholderKind;
  loading?: 'eager' | 'lazy';
  draggable?: boolean;
  style?: CSSProperties;
  decorativeFallback?: boolean;
}

const ICON_BY_KIND: Record<PlaceholderKind, string> = {
  place: 'temple_hindu',
  route: 'route',
  city: 'location_city',
  deity: 'self_improvement',
};

export function PlaceImage({
  src,
  alt = '',
  className,
  fallbackClassName,
  kind = 'place',
  loading = 'lazy',
  draggable,
  style,
  decorativeFallback = true,
}: PlaceImageProps) {
  const [failed, setFailed] = useState(false);
  const imageUrl = src ? getFullImageUrl(src) : '';
  const fallbackSizingClass = className ?? 'h-full w-full';

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  if (imageUrl && !failed) {
    return (
      <img
        src={imageUrl}
        alt={alt}
        className={className}
        loading={loading}
        draggable={draggable}
        style={style}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden',
        'bg-[radial-gradient(circle_at_28%_18%,rgba(255,255,255,0.48),transparent_30%),linear-gradient(135deg,#ead9c0_0%,#d6b996_52%,#ab553e_140%)]',
        'dark:bg-[radial-gradient(circle_at_28%_18%,rgba(255,255,255,0.08),transparent_30%),linear-gradient(135deg,#23302d_0%,#364844_58%,#ab553e_150%)]',
        fallbackSizingClass,
        fallbackClassName,
      )}
      aria-hidden={decorativeFallback}
      role={decorativeFallback ? undefined : 'img'}
      aria-label={decorativeFallback ? undefined : alt}
      style={style}
    >
      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full border-[18px] border-white/20 dark:border-white/10" />
      <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full border-[20px] border-primary/20 dark:border-primary/25" />
      <span
        className="material-symbols-outlined relative z-10 text-[2.4rem] text-primary/70 drop-shadow-sm dark:text-white/70"
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        {ICON_BY_KIND[kind]}
      </span>
    </div>
  );
}

export default PlaceImage;
