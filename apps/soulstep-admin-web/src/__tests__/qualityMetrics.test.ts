import { describe, expect, it } from "vitest";
import { formatGateLabel, formatScore, gateColor } from "@/lib/utils/qualityMetrics";

describe("formatScore", () => {
  it("returns '—' for null", () => {
    expect(formatScore(null)).toBe("—");
  });

  it("returns '—' for undefined", () => {
    expect(formatScore(undefined)).toBe("—");
  });

  it("formats a score to 2 decimal places", () => {
    expect(formatScore(0.75)).toBe("0.75");
  });

  it("formats 0 correctly", () => {
    expect(formatScore(0)).toBe("0.00");
  });

  it("formats 1 correctly", () => {
    expect(formatScore(1)).toBe("1.00");
  });

  it("rounds to 2 decimal places", () => {
    expect(formatScore(0.1234)).toBe("0.12");
  });
});

describe("gateColor", () => {
  it("returns red for below_image_gate", () => {
    expect(gateColor("below_image_gate")).toBe("#ef4444");
  });

  it("returns amber for below_enrichment_gate", () => {
    expect(gateColor("below_enrichment_gate")).toBe("#f59e0b");
  });

  it("returns orange for below_sync_gate", () => {
    expect(gateColor("below_sync_gate")).toBe("#f97316");
  });

  it("returns green for passed", () => {
    expect(gateColor("passed")).toBe("#10b981");
  });

  it("returns gray for unknown gate", () => {
    expect(gateColor("unknown_gate")).toBe("#6b7280");
  });
});

describe("formatGateLabel", () => {
  it("labels below_image_gate correctly", () => {
    expect(formatGateLabel("below_image_gate")).toBe("Below Image Gate");
  });

  it("labels below_enrichment_gate correctly", () => {
    expect(formatGateLabel("below_enrichment_gate")).toBe("Below Enrichment Gate");
  });

  it("labels below_sync_gate correctly", () => {
    expect(formatGateLabel("below_sync_gate")).toBe("Below Sync Gate");
  });

  it("labels passed correctly", () => {
    expect(formatGateLabel("passed")).toBe("Passed");
  });

  it("falls back to raw gate string for unknown gate", () => {
    expect(formatGateLabel("custom_gate")).toBe("custom_gate");
  });
});
