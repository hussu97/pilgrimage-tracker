'use client';

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
  const adHostRef = useRef<HTMLDivElement>(null);
  const slotId = getSlotId(slot);
  const isRtl = locale === 'ar';

  useEffect(() => {
    const host = adHostRef.current;
    if (!canShowAds || !slotId || !host) return;

    host.replaceChildren();

    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', slotId.split('/')[0] || '');
    ins.setAttribute('data-ad-slot', slotId);
    ins.setAttribute('data-ad-format', format);
    ins.setAttribute('data-full-width-responsive', 'true');
    if (process.env.NODE_ENV !== 'production') {
      ins.setAttribute('data-adtest', 'on');
    }
    host.appendChild(ins);

    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      const adsbygoogle = (w.adsbygoogle = w.adsbygoogle || []);
      adsbygoogle.push({});
    } catch {
      // AdSense is non-critical and can be blocked by browser privacy settings.
    }

    return () => {
      ins.parentNode?.removeChild(ins);
      host.replaceChildren();
    };
  }, [canShowAds, format, slotId]);

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
      <div ref={adHostRef} />
    </div>
  );
}
