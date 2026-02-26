/**
 * AdBanner — renders a Google AdSense ad unit.
 *
 * Self-gating: renders nothing when ads are disabled, consent not given,
 * or user is premium. Dark-mode and RTL aware.
 *
 * Usage: <AdBanner slot="place-detail-mid" format="rectangle" />
 */

import { useEffect, useRef } from 'react';
import { useAds } from './AdProvider';
import { useI18n } from '@/app/providers';
import type { AdSlotName, AdFormat } from './ad-constants';

interface AdBannerProps {
  /** Slot name — maps to an ad unit ID via backend config. */
  slot: AdSlotName;
  /** Ad format hint for AdSense. */
  format?: AdFormat;
  /** Extra CSS classes on the outer container. */
  className?: string;
}

export default function AdBanner({ slot, format = 'auto', className = '' }: AdBannerProps) {
  const { canShowAds, getSlotId } = useAds();
  const { t, locale } = useI18n();
  const adRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);
  const slotId = getSlotId(slot);
  const isRtl = locale === 'ar';

  useEffect(() => {
    if (!canShowAds || !slotId || pushed.current) return;
    try {
      const adsbygoogle = (window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle;
      if (adsbygoogle) {
        adsbygoogle.push({});
        pushed.current = true;
      }
    } catch {
      // AdSense not loaded yet — will retry on next render
    }
  }, [canShowAds, slotId]);

  if (!canShowAds || !slotId) return null;

  return (
    <div
      className={`relative w-full bg-surface dark:bg-dark-surface rounded-2xl overflow-hidden ${className}`}
      style={{ minHeight: format === 'rectangle' ? 250 : 90 }}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <span className="absolute top-1 left-2 text-[10px] text-muted dark:text-dark-text-secondary uppercase tracking-wider z-10">
        {t('ads.label')}
      </span>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={getSlotId(slot).split('/')[0] || ''}
        data-ad-slot={slotId}
        data-ad-format={format}
        data-full-width-responsive="true"
        data-adtest={import.meta.env.DEV ? 'on' : undefined}
      />
    </div>
  );
}
