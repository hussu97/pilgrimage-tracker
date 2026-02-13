/**
 * API client for Pilgrimage Tracker. Uses EXPO_PUBLIC_API_URL for base URL.
 * When unset, defaults to 127.0.0.1:3000 so the simulator can reach the backend on the host machine.
 */
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:3000';

export async function getLanguages() {
  const res = await fetch(`${API_BASE}/api/v1/languages`);
  if (!res.ok) throw new Error('Failed to fetch languages');
  return res.json();
}

export async function getTranslations(lang) {
  const res = await fetch(`${API_BASE}/api/v1/translations?lang=${encodeURIComponent(lang)}`);
  if (!res.ok) throw new Error('Failed to fetch translations');
  return res.json();
}
