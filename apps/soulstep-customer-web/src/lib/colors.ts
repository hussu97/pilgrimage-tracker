/**
 * Web design tokens for inline `style={{}}` props and Leaflet HTML strings.
 * Mirrors tailwind.config.js — keep the two in sync.
 * Use Tailwind utility classes wherever possible; only fall back to these
 * constants when a Tailwind class cannot be used (e.g. inline React styles,
 * dynamically-built DOM HTML strings for Leaflet markers).
 */
export const COLORS = {
  // ── Core palette ─────────────────────────────────────────────────────
  primary: '#B0563D',
  primaryAlpha30: 'rgba(176,86,61,0.3)',
  primaryAlpha22: 'rgba(176,86,61,0.22)',
  primaryAlpha15: 'rgba(176,86,61,0.15)',
  surface: '#ffffff',
  darkSurface: '#242424',
  textMain: '#2D3E3B',
  textSecondary: '#6B7280',
  compassNeutral: '#9CA3AF',

  // ── Open/closed status ───────────────────────────────────────────────
  openNow: '#16a34a',
  openNowAlpha85: 'rgba(22,163,74,0.85)',
  openNowAlpha90: 'rgba(22,163,74,0.9)',
  openNowAlpha12: 'rgba(22,163,74,0.12)',
  closedNow: '#EF4444',
  closedNowAlpha85: 'rgba(220,38,38,0.85)',
  closedNowAlpha12: 'rgba(239,68,68,0.12)',
  unknownStatus: 'rgba(148,163,184,0.85)',

  // ── Favorites ────────────────────────────────────────────────────────
  favoriteActive: '#f87171',

  // ── Leaflet map markers ──────────────────────────────────────────────
  mapSearchPin: '#ea580c',
  mapSearchPinAlpha18: 'rgba(234,88,12,0.18)',
  mapSearchPinAlpha50: 'rgba(234,88,12,0.5)',
  mapUserPin: '#2563eb',
  mapUserPinAlpha22: 'rgba(37,99,235,0.22)',
  mapUserPinAlpha55: 'rgba(37,99,235,0.55)',
  mapJourneyCheckedIn: 'rgba(34,197,94,0.9)',
  mapJourneyPending: 'rgba(59,130,246,0.9)',
  mapPopupTitle: '#1e293b',
  mapPopupMuted: '#6b7280',
  mapPopupLink: '#2563eb',
  mapIconGrey: '#374151',

  // ── Quick-action grid (Home screen) ─────────────────────────────────
  actionMap: '#10B981',
  actionCreate: '#3B82F6',
  actionJoin: '#8B5CF6',
  actionFavorites: '#F43F5E',

  // ── Faith / religion category icons ─────────────────────────────────
  faithIslam: '#0891b2',
  faithHinduism: '#d97706',
  faithChristianity: '#7c3aed',
} as const;
