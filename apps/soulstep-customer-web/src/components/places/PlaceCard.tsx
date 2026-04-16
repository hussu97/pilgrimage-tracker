'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from '@/lib/navigation';
import type { Place } from '@/lib/types';
import { useI18n, useTheme } from '@/app/providers';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import { formatDistance } from '@/lib/utils/place-utils';

interface PlaceCardProps {
  place: Place;
  compact?: boolean;
}

export default function PlaceCard({ place, compact = false }: PlaceCardProps) {
  const { t } = useI18n();
  const { units } = useTheme();
  const rating = place.average_rating;
  const reviewCount = place.review_count ?? 0;
  const openStatus =
    place.open_status ??
    (place.is_open_now === true ? 'open' : place.is_open_now === false ? 'closed' : 'unknown');
  const isOpen = openStatus === 'open';
  const isClosed = openStatus === 'closed';
  const isUnknown = openStatus === 'unknown';

  const rawImages = place.images ?? [];
  const images = rawImages.map((img) => getFullImageUrl(img.url)).filter(Boolean) as string[];
  const imageUrl = images[0] ?? null;
  const altTexts = rawImages.map((img) => img.alt_text || place.name);

  // Carousel state (regular variant only)
  const [imgIdx, setImgIdx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [isInView, setIsInView] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const didDragRef = useRef(false);

  // IntersectionObserver for mobile/mobile-web auto-swipe
  useEffect(() => {
    if (compact || images.length <= 1) return;
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => setIsInView(entry.isIntersecting), {
      threshold: 0.5,
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [compact, images.length]);

  // Auto-swipe timer
  useEffect(() => {
    if (compact || images.length <= 1) return;
    if (!isInView && !isHovered) return;
    const id = setInterval(() => {
      setImgIdx((prev) => (prev + 1) % images.length);
    }, 3000);
    return () => clearInterval(id);
  }, [compact, images.length, isInView, isHovered]);

  const advanceCarousel = useCallback(
    (delta: number) => {
      setImgIdx((prev) => (prev + delta + images.length) % images.length);
    },
    [images.length],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
    didDragRef.current = false;
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      const diff = e.clientX - dragStartX;
      if (Math.abs(diff) >= 40) {
        advanceCarousel(diff < 0 ? 1 : -1);
        setDragStartX(e.clientX);
        didDragRef.current = true;
      }
    },
    [isDragging, dragStartX, advanceCarousel],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  if (compact) {
    return (
      <Link
        to={`/places/${place.place_code}`}
        className="flex gap-4 h-32 bg-white dark:bg-dark-surface rounded-2xl p-4 shadow-card border border-slate-100 dark:border-dark-border items-center hover:shadow-card-md transition-shadow group"
      >
        <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 bg-soft-blue dark:bg-dark-surface">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={altTexts[0] || place.name}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl text-text-muted">explore</span>
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col justify-center h-full py-1 min-w-0">
          <h3 className="text-base font-medium text-slate-800 dark:text-white leading-tight truncate group-hover:text-primary transition-colors">
            {place.name}
          </h3>
          <p className="text-xs text-slate-400 dark:text-dark-text-secondary mt-1 line-clamp-2 font-light">
            {place.address || place.place_type || ''}
          </p>
          <div className="flex items-center gap-2 mt-3">
            {isOpen && (
              <span className="badge-open">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                {t('places.open')}
              </span>
            )}
            {isClosed && <span className="badge-closed">{t('places.closed')}</span>}
            {isUnknown && <span className="badge-unknown">{t('places.unknown')}</span>}
            {place.distance != null && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-dark-surface text-slate-500 dark:text-dark-text-secondary">
                {formatDistance(place.distance, units)}
              </span>
            )}
            {rating != null && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-800/30">
                <span
                  className="material-symbols-outlined text-[10px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  star
                </span>
                {rating.toFixed(1)}
                {reviewCount > 0 && <span className="text-amber-500/70">({reviewCount})</span>}
              </span>
            )}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to={`/places/${place.place_code}`}
      className="block bg-surface dark:bg-dark-surface rounded-2xl overflow-hidden shadow-card border border-slate-100 dark:border-dark-border hover:shadow-card-md transition-all hover:-translate-y-0.5 group"
      onClick={(e) => {
        if (didDragRef.current) e.preventDefault();
      }}
    >
      {/* Hero image carousel */}
      <div
        ref={containerRef}
        className="relative h-48 w-full overflow-hidden bg-soft-blue dark:bg-dark-surface select-none"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setIsDragging(false);
        }}
        onMouseDown={images.length > 1 ? handleMouseDown : undefined}
        onMouseMove={images.length > 1 ? handleMouseMove : undefined}
        onMouseUp={images.length > 1 ? handleMouseUp : undefined}
        style={{
          aspectRatio: '16/9',
          cursor: images.length > 1 ? (isDragging ? 'grabbing' : 'grab') : undefined,
        }}
      >
        {images.length > 0 ? (
          <div
            className="flex h-full transition-transform duration-500 ease-in-out"
            style={{
              transform: `translateX(-${imgIdx * (100 / images.length)}%)`,
              width: `${images.length * 100}%`,
            }}
          >
            {images.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={altTexts[i] || place.name}
                className="h-full object-cover flex-shrink-0"
                style={{ width: `${100 / images.length}%` }}
                draggable={false}
                loading="lazy"
              />
            ))}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-text-muted">explore</span>
          </div>
        )}

        {/* Hero gradient */}
        <div className="absolute inset-0 hero-gradient pointer-events-none" />

        {/* Top badges */}
        <div className="absolute top-3 right-3 left-3 flex justify-between items-start z-10 pointer-events-none">
          <div className="flex items-center gap-2">
            {isOpen && (
              <span className="badge-open">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                {t('places.open')}
              </span>
            )}
            {isClosed && <span className="badge-closed">{t('places.closed')}</span>}
            {isUnknown && <span className="badge-unknown">{t('places.unknown')}</span>}
          </div>
          {place.user_has_checked_in && (
            <span className="badge-visited">
              <span className="material-symbols-outlined text-[12px]">check</span>
              {t('places.visited')}
            </span>
          )}
        </div>
      </div>

      {/* Card body – 16px padding */}
      <div className="p-4">
        <div className="flex justify-between items-start gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-text-main dark:text-white group-hover:text-primary transition-colors truncate leading-tight">
              {place.name}
            </h3>
            <p className="text-sm text-text-secondary dark:text-dark-text-secondary flex items-center mt-1 truncate">
              <span className="material-symbols-outlined text-icon-grey text-sm mr-1 shrink-0">
                location_on
              </span>
              <span className="truncate">{place.address || place.place_type}</span>
            </p>
          </div>
          {place.distance != null && (
            <span className="text-xs font-medium text-text-secondary dark:text-dark-text-secondary bg-blue-tint dark:bg-dark-surface border border-soft-blue/50 dark:border-dark-border px-2 py-1 rounded-xl shrink-0 whitespace-nowrap">
              {formatDistance(place.distance, units)}
            </span>
          )}
        </div>

        {/* Footer – rating pill + CTA */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-dark-border">
          {rating != null ? (
            <div className="flex items-center gap-1.5">
              <span
                className="material-symbols-outlined text-amber-400 text-base"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                star
              </span>
              <span className="text-sm font-semibold text-text-main dark:text-white">
                {rating.toFixed(1)}
              </span>
              {reviewCount > 0 && <span className="text-xs text-text-muted">({reviewCount})</span>}
            </div>
          ) : (
            <span />
          )}
          <span className="text-xs font-semibold text-primary uppercase tracking-wide">
            {t('places.detail')}
          </span>
        </div>
      </div>
    </Link>
  );
}
