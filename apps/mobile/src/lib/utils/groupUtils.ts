/**
 * Utility functions for group screens.
 * Shared logic for progress levels and relative time formatting.
 */

/**
 * Returns a progress level label based on a percentage (0–100).
 */
export function getProgressLevel(percent: number): 'none' | 'low' | 'medium' | 'high' | 'complete' {
  if (percent >= 100) return 'complete';
  if (percent >= 75) return 'high';
  if (percent >= 25) return 'medium';
  if (percent > 0) return 'low';
  return 'none';
}

/**
 * Formats an ISO datetime string as a short relative time label.
 * Falls back to toLocaleDateString() for dates older than 7 days.
 */
export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}
