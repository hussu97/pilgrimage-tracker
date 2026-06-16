'use client';

import { useEffect } from 'react';

const APP_NAME = 'SoulStep';

export interface HeadConfig {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  ogType?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  twitterCard?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  jsonLd?: Record<string, unknown>[];
  hreflangAlternates?: Array<{ lang: string; href: string }>;
}

export function buildDocumentTitle(title?: string): string {
  return title ? `${title} | ${APP_NAME}` : APP_NAME;
}

export function useHead(config: HeadConfig): void {
  useEffect(() => {
    if (!config.title) return;

    // Next owns head resources; client-side DOM removal can invalidate React 19 hoistables.
    const title = buildDocumentTitle(config.title);
    document.title = title;
    return () => {
      if (document.title === title) {
        document.title = APP_NAME;
      }
    };
  }, [config.title]);
}
