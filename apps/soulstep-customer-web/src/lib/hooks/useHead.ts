import { useEffect, useRef } from 'react';

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

function createMeta(name: string, content: string): HTMLMetaElement {
  const el = document.createElement('meta');
  el.setAttribute('name', name);
  el.setAttribute('content', content);
  return el;
}

function createMetaProperty(property: string, content: string): HTMLMetaElement {
  const el = document.createElement('meta');
  el.setAttribute('property', property);
  el.setAttribute('content', content);
  return el;
}

function createLink(rel: string, attrs: Record<string, string>): HTMLLinkElement {
  const el = document.createElement('link');
  el.setAttribute('rel', rel);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

export function useHead(config: HeadConfig): void {
  const trackedElements = useRef<HTMLElement[]>([]);

  useEffect(() => {
    // Clean up previously created elements
    for (const el of trackedElements.current) {
      el.parentNode?.removeChild(el);
    }
    trackedElements.current = [];

    const head = document.head;
    const elements: HTMLElement[] = [];

    // Title
    if (config.title) {
      document.title = `${config.title} | ${APP_NAME}`;
    }

    // Description
    if (config.description) {
      const el = createMeta('description', config.description);
      head.appendChild(el);
      elements.push(el);
    }

    // Canonical
    if (config.canonicalUrl) {
      const el = createLink('canonical', { href: config.canonicalUrl });
      head.appendChild(el);
      elements.push(el);
    }

    // OG tags
    if (config.ogType) {
      const el = createMetaProperty('og:type', config.ogType);
      head.appendChild(el);
      elements.push(el);
    }
    {
      const el = createMetaProperty('og:site_name', APP_NAME);
      head.appendChild(el);
      elements.push(el);
    }
    if (config.ogTitle) {
      const el = createMetaProperty('og:title', config.ogTitle);
      head.appendChild(el);
      elements.push(el);
    }
    if (config.ogDescription) {
      const el = createMetaProperty('og:description', config.ogDescription);
      head.appendChild(el);
      elements.push(el);
    }
    if (config.ogImage) {
      const el = createMetaProperty('og:image', config.ogImage);
      head.appendChild(el);
      elements.push(el);
    }
    if (config.ogUrl) {
      const el = createMetaProperty('og:url', config.ogUrl);
      head.appendChild(el);
      elements.push(el);
    }

    // Twitter tags
    if (config.twitterCard) {
      const el = createMeta('twitter:card', config.twitterCard);
      head.appendChild(el);
      elements.push(el);
    }
    if (config.twitterTitle) {
      const el = createMeta('twitter:title', config.twitterTitle);
      head.appendChild(el);
      elements.push(el);
    }
    if (config.twitterDescription) {
      const el = createMeta('twitter:description', config.twitterDescription);
      head.appendChild(el);
      elements.push(el);
    }
    if (config.twitterImage) {
      const el = createMeta('twitter:image', config.twitterImage);
      head.appendChild(el);
      elements.push(el);
    }

    // Hreflang alternates
    if (config.hreflangAlternates) {
      for (const alt of config.hreflangAlternates) {
        const el = createLink('alternate', { hreflang: alt.lang, href: alt.href });
        head.appendChild(el);
        elements.push(el);
      }
    }

    // JSON-LD
    if (config.jsonLd) {
      for (const schema of config.jsonLd) {
        const el = document.createElement('script');
        el.setAttribute('type', 'application/ld+json');
        el.textContent = JSON.stringify(schema);
        head.appendChild(el);
        elements.push(el);
      }
    }

    trackedElements.current = elements;

    return () => {
      for (const el of trackedElements.current) {
        el.parentNode?.removeChild(el);
      }
      trackedElements.current = [];
      document.title = APP_NAME;
    };
  }, [
    config.title,
    config.description,
    config.canonicalUrl,
    config.ogType,
    config.ogTitle,
    config.ogDescription,
    config.ogImage,
    config.ogUrl,
    config.twitterCard,
    config.twitterTitle,
    config.twitterDescription,
    config.twitterImage,
    config.jsonLd,
    config.hreflangAlternates,
  ]);
}
