'use client';

/**
 * AdBanner — renders a configured ad unit.
 *
 * Self-gating: renders nothing when ads are disabled, consent not given,
 * or user is premium. Dark-mode and RTL aware.
 *
 * Usage: <AdBanner slot="place-detail-mid" format="rectangle" />
 */

import { useEffect, useRef, useState } from 'react';
import { useAds } from './AdProvider';
import { useI18n } from '@/app/providers';
import { renderAdsterraSlot } from './adsterra';
import {
  isAdsterraSlotConfig,
  type AdFormat,
  type AdSlotConfig,
  type AdSlotName,
} from './ad-constants';

interface AdBannerProps {
  /** Slot name — maps to an ad unit ID via backend config. */
  slot: AdSlotName;
  /** Ad format hint for AdSense. */
  format?: AdFormat;
  /** Extra CSS classes on the outer container. */
  className?: string;
}

export const AD_SLOT_COLLAPSE_TIMEOUT_MS = 4000;
const AD_SLOT_FILL_CHECK_INTERVAL_MS = 500;

export default function AdBanner({ slot, format = 'auto', className = '' }: AdBannerProps) {
  const { canShowAds, getSlotConfig, getSlotId } = useAds();
  const { t, locale } = useI18n();
  const adHostRef = useRef<HTMLDivElement>(null);
  const [collapsedSignature, setCollapsedSignature] = useState<string | null>(null);
  const slotConfig = getSlotConfig(slot);
  const slotId = getSlotId(slot);
  const isRtl = locale === 'ar';
  const slotSignature = `${slot}:${format}:${slotId}:${JSON.stringify(slotConfig ?? null)}`;

  useEffect(() => {
    const host = adHostRef.current;
    if (!canShowAds || !slotConfig || !host) return;

    host.replaceChildren();
    setCollapsedSignature((current) => (current === slotSignature ? null : current));
    let stopFillProbe: (() => void) | undefined;

    if (isAdsterraSlotConfig(slotConfig)) {
      renderAdsterraSlot(host, slotConfig, format);
      stopFillProbe = startAdFillProbe(host, () => {
        host.replaceChildren();
        setCollapsedSignature(slotSignature);
      });
      return () => {
        stopFillProbe?.();
        host.replaceChildren();
      };
    }

    if (!slotId) return;

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

    stopFillProbe = startAdFillProbe(host, () => {
      host.replaceChildren();
      setCollapsedSignature(slotSignature);
    });

    return () => {
      stopFillProbe?.();
      ins.parentNode?.removeChild(ins);
      host.replaceChildren();
    };
  }, [canShowAds, format, slotConfig, slotId, slotSignature]);

  if (!canShowAds || !hasRenderableSlot(slotConfig) || collapsedSignature === slotSignature) {
    return null;
  }

  return (
    <div
      data-ad-slot={slot}
      className={`relative w-full bg-surface dark:bg-dark-surface rounded-2xl overflow-hidden ${className}`}
      style={{ minHeight: format === 'rectangle' ? 250 : 90 }}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <span className="absolute top-1 left-2 text-[10px] text-muted dark:text-dark-text-secondary uppercase tracking-wider z-10">
        {t('ads.label')}
      </span>
      <div ref={adHostRef} data-ad-host={slot} />
    </div>
  );
}

function startAdFillProbe(host: HTMLElement, onEmpty: () => void): () => void {
  let stopped = false;

  function stop() {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(timeoutId);
    window.clearInterval(intervalId);
    observer.disconnect();
  }

  function keepIfFilled() {
    if (!stopped && hasAdCreative(host)) {
      stop();
    }
  }

  const timeoutId = window.setTimeout(() => {
    if (hasAdCreative(host)) {
      stop();
      return;
    }
    stop();
    onEmpty();
  }, AD_SLOT_COLLAPSE_TIMEOUT_MS);
  const intervalId = window.setInterval(keepIfFilled, AD_SLOT_FILL_CHECK_INTERVAL_MS);
  const observer = new MutationObserver(keepIfFilled);

  observer.observe(host, { attributes: true, childList: true, subtree: true });

  keepIfFilled();
  return stop;
}

export function hasAdCreative(host: HTMLElement): boolean {
  return Array.from(host.childNodes).some(hasMeaningfulAdNode);
}

function hasMeaningfulAdNode(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    return Boolean(node.textContent?.trim());
  }

  if (!(node instanceof HTMLElement) && !(node instanceof SVGElement)) {
    return false;
  }

  const tagName = node.tagName.toLowerCase();
  if (tagName === 'script' || tagName === 'style') return false;
  if (tagName === 'iframe' || tagName === 'img' || tagName === 'video' || tagName === 'canvas') {
    return true;
  }
  if (node instanceof SVGElement && tagName === 'svg') return true;

  if (node.childNodes.length === 0) {
    return Boolean(node.textContent?.trim());
  }

  return Array.from(node.childNodes).some(hasMeaningfulAdNode);
}

function hasRenderableSlot(config: AdSlotConfig | undefined): boolean {
  if (!config) return false;
  if (typeof config === 'string') return Boolean(config);
  if (config.provider === 'adsterra') {
    return Boolean(config.scriptSrc || config.script_src || config.key);
  }
  return Boolean(config.slotId || config.slot_id);
}
