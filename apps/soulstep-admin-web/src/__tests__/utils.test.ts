import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime } from "@/lib/utils";

describe("formatDate", () => {
  it("formats ISO date string to readable date", () => {
    const result = formatDate("2024-01-15T10:30:00Z");
    expect(result).toContain("Jan");
    expect(result).toContain("2024");
  });
});

describe("formatDateTime", () => {
  it("formats ISO datetime string to readable date+time", () => {
    const result = formatDateTime("2024-01-15T10:30:00Z");
    expect(result).toContain("Jan");
    expect(result).toContain("2024");
  });
});
