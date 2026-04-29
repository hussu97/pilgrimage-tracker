const CLEANUP_MARKER = 'soulstep:legacy-sw-cleaned';

async function deleteLegacyCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const names = await caches.keys();
  await Promise.all(names.map((name) => caches.delete(name)));
}

async function unregisterServiceWorkers(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

export function cleanupLegacyServiceWorkers(): void {
  if (typeof window === 'undefined') return;
  try {
    if (sessionStorage.getItem(CLEANUP_MARKER) === '1') return;
    sessionStorage.setItem(CLEANUP_MARKER, '1');
  } catch {
    // Continue even when sessionStorage is unavailable.
  }

  Promise.all([unregisterServiceWorkers(), deleteLegacyCaches()]).catch(() => {});
}
