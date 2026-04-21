// Sync-lock + ETA math for the scraper run detail page. Pulled out of JSX
// so Vitest can exercise the branching logic without a DOM.

export const SYNC_LOCK_MS = 10 * 60 * 1000; // 10 minutes

export interface SyncLockState {
  locked: boolean;
  minutesSinceLastSync: number | null; // null = never synced
  minutesUntilUnlock: number; // 0 when unlocked
  tooltip: string;
  buttonLabel: string;
}

export function computeSyncLockState(
  lastSyncAtIso: string | null,
  nowMs: number = Date.now(),
): SyncLockState {
  if (!lastSyncAtIso) {
    return {
      locked: false,
      minutesSinceLastSync: null,
      minutesUntilUnlock: 0,
      tooltip: "No successful sync yet",
      buttonLabel: "Sync",
    };
  }
  const lastMs = new Date(lastSyncAtIso).getTime();
  if (Number.isNaN(lastMs)) {
    // Corrupt timestamp — don't lock. Unlock-state tooltip communicates the
    // parse failure so the admin can report it.
    return {
      locked: false,
      minutesSinceLastSync: null,
      minutesUntilUnlock: 0,
      tooltip: "Last sync timestamp unparseable",
      buttonLabel: "Sync",
    };
  }
  const elapsedMs = nowMs - lastMs;
  const minutesSince = Math.floor(elapsedMs / 60000);
  if (elapsedMs < SYNC_LOCK_MS) {
    const minutesLeft = Math.ceil((SYNC_LOCK_MS - elapsedMs) / 60000);
    return {
      locked: true,
      minutesSinceLastSync: minutesSince,
      minutesUntilUnlock: minutesLeft,
      tooltip: `Sync locked — last successful sync ${minutesSince}m ago. Unlocks in ${minutesLeft}m.`,
      buttonLabel: `Sync locked (${minutesLeft}m)`,
    };
  }
  return {
    locked: false,
    minutesSinceLastSync: minutesSince,
    minutesUntilUnlock: 0,
    tooltip: `Last successful sync ${minutesSince}m ago`,
    buttonLabel: "Sync",
  };
}

export function computeEtaSeconds(
  totalItems: number | null,
  processedItems: number,
  avgTimePerPlaceS: number | null,
): number | null {
  if (totalItems == null || totalItems <= 0) return null;
  if (avgTimePerPlaceS == null || avgTimePerPlaceS <= 0) return null;
  if (processedItems >= totalItems) return null;
  const remaining = totalItems - processedItems;
  return remaining * avgTimePerPlaceS;
}

export function formatEta(etaSeconds: number): string {
  if (etaSeconds >= 3600) return `${(etaSeconds / 3600).toFixed(1)}h`;
  if (etaSeconds >= 60) return `${(etaSeconds / 60).toFixed(0)}m`;
  return `${etaSeconds.toFixed(0)}s`;
}
