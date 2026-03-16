import { useRef, useCallback } from 'react';

interface HorizontalCarouselProps {
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
}

const SCROLL_AMOUNT = 220;

export default function HorizontalCarousel({
  ariaLabel,
  children,
  className = '',
}: HorizontalCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      scrollRef.current.scrollBy({ left: SCROLL_AMOUNT, behavior: 'smooth' });
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      scrollRef.current.scrollBy({ left: -SCROLL_AMOUNT, behavior: 'smooth' });
    }
  }, []);

  return (
    <div
      ref={scrollRef}
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={`flex flex-nowrap gap-3 overflow-x-auto pb-2 scrollbar-hide focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-lg ${className}`}
    >
      {children}
    </div>
  );
}
