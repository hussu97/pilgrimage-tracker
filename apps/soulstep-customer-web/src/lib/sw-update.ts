/**
 * Service Worker update checker.
 *
 * Checks for new SW versions:
 *  - Every 60 seconds while the page is active
 *  - Immediately when the page regains visibility (tab switch / phone wake)
 *
 * When an update is found the new SW activates via skipWaiting (autoUpdate mode)
 * and the page reloads so the user always sees the latest build.
 */
import { registerSW } from 'virtual:pwa-register';

const UPDATE_INTERVAL_MS = 60_000; // 1 minute

export function initSWUpdater() {
  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl: string, registration: ServiceWorkerRegistration | undefined) {
      if (!registration) return;

      // Periodic check every 60 seconds
      setInterval(() => {
        registration.update();
      }, UPDATE_INTERVAL_MS);

      // Check when page regains visibility (tab switch, phone unlock)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update();
        }
      });
    },
    onNeedRefresh() {
      // autoUpdate mode handles skipWaiting automatically;
      // reload so the new assets take effect immediately.
      window.location.reload();
    },
  });

  return updateSW;
}
