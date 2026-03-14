import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Pure logic extracted from BulkTranslationsPage ───────────────────────────
// These are the same functions defined in BulkTranslationsPage.tsx — we
// replicate them here to keep tests free of React component imports.

function computeProgress(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, (completed / total) * 100);
}

const STATUS_COLORS: Record<string, string> = {
  pending:
    "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20",
  running:
    "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20",
  completed:
    "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20",
  completed_with_errors:
    "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20",
  failed:
    "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20",
  cancelled:
    "text-gray-500 dark:text-dark-text-secondary bg-gray-100 dark:bg-dark-surface",
};

// ── computeProgress ───────────────────────────────────────────────────────────

describe("computeProgress", () => {
  it("returns 0 when total is 0", () => {
    expect(computeProgress(0, 0)).toBe(0);
  });

  it("returns 0 when completed is 0", () => {
    expect(computeProgress(0, 100)).toBe(0);
  });

  it("returns 100 when completed equals total", () => {
    expect(computeProgress(50, 50)).toBe(100);
  });

  it("returns correct percentage for partial completion", () => {
    expect(computeProgress(25, 100)).toBe(25);
  });

  it("caps at 100 even if completed exceeds total", () => {
    expect(computeProgress(110, 100)).toBe(100);
  });
});

// ── STATUS_COLORS ─────────────────────────────────────────────────────────────

describe("STATUS_COLORS", () => {
  const expectedStatuses = [
    "pending",
    "running",
    "completed",
    "completed_with_errors",
    "failed",
    "cancelled",
  ];

  it("has entries for all expected status values", () => {
    for (const status of expectedStatuses) {
      expect(STATUS_COLORS[status]).toBeDefined();
      expect(STATUS_COLORS[status].length).toBeGreaterThan(0);
    }
  });

  it("all status color strings include dark mode classes", () => {
    for (const status of expectedStatuses) {
      expect(STATUS_COLORS[status]).toContain("dark:");
    }
  });
});

// ── API endpoint paths ────────────────────────────────────────────────────────

describe("API endpoint paths", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("listTranslationJobs calls GET /admin/translations/jobs", async () => {
    const mockGet = vi.fn().mockResolvedValue({ data: { items: [], total: 0, page: 1, page_size: 50 } });
    vi.doMock("@/lib/api/client", () => ({
      apiClient: { get: mockGet, post: vi.fn(), delete: vi.fn() },
    }));

    const { listTranslationJobs } = await import("@/lib/api/admin");
    await listTranslationJobs({ page: 1, page_size: 50 });
    expect(mockGet).toHaveBeenCalledWith(
      "/admin/translations/jobs",
      { params: { page: 1, page_size: 50 } }
    );
  });

});
