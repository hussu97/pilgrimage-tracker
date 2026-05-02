import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import PlaceImage from '@/components/places/PlaceImage';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let mountedRoots: Array<ReturnType<typeof createRoot>> = [];

function renderComponent(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  act(() => {
    root.render(ui);
  });

  return { container };
}

afterEach(() => {
  for (const root of mountedRoots) {
    act(() => {
      root.unmount();
    });
  }
  mountedRoots = [];
  document.body.innerHTML = '';
});

describe('PlaceImage', () => {
  it('renders a decorative placeholder when no image URL is available', () => {
    const { container } = renderComponent(<PlaceImage src={null} alt="Temple image" />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(container.textContent).toContain('temple_hindu');
  });

  it('preserves image alt text and falls back after a broken URL', () => {
    const { container } = renderComponent(
      <PlaceImage src="/broken-place.jpg" alt="Lotus Temple" />,
    );

    const image = container.querySelector('img[alt="Lotus Temple"]');
    expect(image).not.toBeNull();
    act(() => {
      image?.dispatchEvent(new Event('error', { bubbles: true }));
    });

    expect(container.querySelector('img[alt="Lotus Temple"]')).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(container.textContent).toContain('temple_hindu');
  });

  it('can expose the fallback as a labelled image for non-decorative use cases', () => {
    const { container } = renderComponent(
      <PlaceImage src="" alt="Deity timing" kind="deity" decorativeFallback={false} />,
    );

    const fallback = container.querySelector('[role="img"][aria-label="Deity timing"]');
    expect(fallback).not.toBeNull();
  });
});
