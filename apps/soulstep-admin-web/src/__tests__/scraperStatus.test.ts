import { describe, it, expect } from "vitest";
import { statusVariant } from "@/lib/utils/scraperStatus";

describe("statusVariant", () => {
  it("returns neutral for null", () => {
    expect(statusVariant(null)).toBe("neutral");
  });

  it("returns success for completed", () => {
    expect(statusVariant("completed")).toBe("success");
  });

  it("returns danger for failed", () => {
    expect(statusVariant("failed")).toBe("danger");
  });

  it("returns info for running", () => {
    expect(statusVariant("running")).toBe("info");
  });

  it("returns warning for cancelled", () => {
    expect(statusVariant("cancelled")).toBe("warning");
  });

  it("returns neutral for unknown string (pending)", () => {
    expect(statusVariant("pending")).toBe("neutral");
  });

  it("returns warning for interrupted", () => {
    expect(statusVariant("interrupted")).toBe("warning");
  });

  it("returns neutral for empty string", () => {
    expect(statusVariant("")).toBe("neutral");
  });
});
