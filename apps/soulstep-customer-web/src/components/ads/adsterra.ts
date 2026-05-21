import type { AdFormat, AdsterraSlotConfig } from './ad-constants';

function normalizeScriptSrc(src: string): string {
  if (src.startsWith('//')) return `https:${src}`;
  return src;
}

function scriptSrcFor(config: AdsterraSlotConfig): string {
  const explicit = config.scriptSrc || config.script_src;
  if (explicit) return normalizeScriptSrc(explicit);
  return config.key ? `https://www.highperformanceformat.com/${config.key}/invoke.js` : '';
}

function defaultSize(format: AdFormat): { width: number; height: number } {
  if (format === 'rectangle') return { width: 300, height: 250 };
  if (format === 'vertical') return { width: 160, height: 600 };
  return { width: 728, height: 90 };
}

function appendExternalScript(parent: HTMLElement, src: string, async = false): HTMLScriptElement {
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = src;
  script.async = async;
  parent.appendChild(script);
  return script;
}

export function renderAdsterraSlot(
  host: HTMLElement,
  config: AdsterraSlotConfig,
  format: AdFormat,
): void {
  const src = scriptSrcFor(config);
  if (!src) return;

  host.replaceChildren();

  const type = config.type || 'banner';
  const containerId = config.containerId || config.container_id;

  if (type === 'native' && containerId) {
    const container = document.createElement('div');
    container.id = containerId;
    host.appendChild(container);
    const script = appendExternalScript(host, src, true);
    script.setAttribute('data-cfasync', 'false');
    return;
  }

  if (type === 'banner') {
    const fallback = defaultSize(format);
    const options = {
      key: config.key,
      format: 'iframe',
      height: config.height || fallback.height,
      width: config.width || fallback.width,
      params: config.params || {},
    };
    const inline = document.createElement('script');
    inline.type = 'text/javascript';
    inline.text = `atOptions = ${JSON.stringify(options)};`;
    host.appendChild(inline);
  }

  appendExternalScript(host, src);
}

export function injectAdsterraGlobalScript(
  slotId: string,
  config: AdsterraSlotConfig | undefined,
): () => void {
  if (!config) return () => {};
  const src = scriptSrcFor(config);
  if (!src) return () => {};

  const existing = document.getElementById(slotId);
  if (existing) return () => {};

  const host = document.createElement('div');
  host.id = slotId;
  host.hidden = true;
  document.body.appendChild(host);
  renderAdsterraSlot(host, config, 'auto');

  return () => {
    host.remove();
  };
}
