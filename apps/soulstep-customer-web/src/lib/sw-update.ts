/**
 * Service Worker update checker for Next.js / next-pwa.
 *
 * With next-pwa the service worker is registered automatically via
 * next.config.ts.  This module provides a lightweight helper that
 * listens for new SW versions and reloads the page so users always
 * see the latest build — matching the behaviour of the former
 * vite-plugin-pwa autoUpdate mode.
 */

const UPDATE_INTERVAL_MS = 60_000; // 1 minute

export function initSWUpdater(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker.ready
    .then((registration) => {
      // Periodic update check
      setInterval(() => {
        registration.update().catch(() => {});
      }, UPDATE_INTERVAL_MS);

      // Re-check when the tab regains focus
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {});
        }
      });
    })
    .catch(() => {
      // SW not available in this environment — ignore
    });

  // When the controlling SW changes (i.e. a new version has activated),
  // reload so the fresh assets take effect.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}
