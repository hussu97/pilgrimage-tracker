/**
 * Utility functions for place-related UI logic.
 */

/**
 * Maps crowd level to Tailwind color classes.
 * @param level - Crowd level: 'low', 'medium', 'high'
 * @returns Tailwind color class string
 */
export function crowdColorClass(level?: string | null): string {
  if (!level) return '';
  const l = level.toLowerCase();
  if (l === 'low') return 'text-emerald-600';
  if (l === 'medium') return 'text-amber-600';
  if (l === 'high') return 'text-red-600';
  return '';
}
