import { describe, it, expect } from "vitest";
import {
  SYNC_LOCK_MS,
  computeEtaSeconds,
  computeSyncLockState,
  formatEta,
} from "@/lib/utils/syncLock";

const anchorNow = Date.parse("2026-04-21T12:00:00Z");

describe("computeSyncLockState", () => {
  it("unlocks when no prior sync exists", () => {
    const s = computeSyncLockState(null, anchorNow);
    expect(s.locked).toBe(false);
    expect(s.minutesSinceLastSync).toBeNull();
    expect(s.buttonLabel).toBe("Sync");
    expect(s.tooltip).toContain("No successful sync yet");
  });

  it("locks when last sync was 3 minutes ago", () => {
    const threeMinAgo = new Date(anchorNow - 3 * 60 * 1000).toISOString();
    const s = computeSyncLockState(threeMinAgo, anchorNow);
    expect(s.locked).toBe(true);
    expect(s.minutesSinceLastSync).toBe(3);
    // Unlock is ceil((10m - 3m) / 1m) = 7 → UI shows "Sync locked (7m)"
    expect(s.minutesUntilUnlock).toBe(7);
    expect(s.buttonLabel).toBe("Sync locked (7m)");
    expect(s.tooltip).toContain("Unlocks in 7m");
  });

  it("unlocks at exactly SYNC_LOCK_MS boundary (elapsed = 10m)", () => {
    const tenMinAgo = new Date(anchorNow - SYNC_LOCK_MS).toISOString();
    const s = computeSyncLockState(tenMinAgo, anchorNow);
    expect(s.locked).toBe(false);
    expect(s.buttonLabel).toBe("Sync");
  });

  it("unlocks when last sync was hours ago", () => {
    const hoursAgo = new Date(anchorNow - 5 * 60 * 60 * 1000).toISOString();
    const s = computeSyncLockState(hoursAgo, anchorNow);
    expect(s.locked).toBe(false);
    expect(s.minutesSinceLastSync).toBe(300);
    expect(s.tooltip).toContain("300m ago");
  });

  it("gracefully handles unparseable timestamp", () => {
    const s = computeSyncLockState("not-a-date", anchorNow);
    expect(s.locked).toBe(false);
    expect(s.tooltip).toContain("unparseable");
  });
});

describe("computeEtaSeconds", () => {
  it("returns null when total_items is null", () => {
    expect(computeEtaSeconds(null, 0, 1.0)).toBeNull();
  });

  it("returns null when avg_time_per_place_s is null or non-positive", () => {
    expect(computeEtaSeconds(100, 10, null)).toBeNull();
    expect(computeEtaSeconds(100, 10, 0)).toBeNull();
    expect(computeEtaSeconds(100, 10, -1)).toBeNull();
  });

  it("returns null when already complete", () => {
    expect(computeEtaSeconds(100, 100, 1.5)).toBeNull();
    expect(computeEtaSeconds(100, 150, 1.5)).toBeNull();
  });

  it("returns remaining * avg for in-flight run", () => {
    expect(computeEtaSeconds(1000, 400, 2.5)).toBe(1500);
  });
});

describe("formatEta", () => {
  it("formats seconds under a minute", () => {
    expect(formatEta(45)).toBe("45s");
  });

  it("formats minutes under an hour", () => {
    expect(formatEta(600)).toBe("10m");
    expect(formatEta(3599)).toBe("60m");
  });

  it("formats hours", () => {
    expect(formatEta(3600)).toBe("1.0h");
    expect(formatEta(7200 + 60 * 30)).toBe("2.5h");
  });
});
