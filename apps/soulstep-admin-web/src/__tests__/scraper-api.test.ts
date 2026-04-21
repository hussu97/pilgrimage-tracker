import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGet, mockPost, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  scraperClient: {
    get: mockGet,
    post: mockPost,
    delete: mockDelete,
  },
}));

import { resumeRun } from "@/lib/api/scraper";

describe("resumeRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ data: { status: "queued" } });
  });

  it("POSTs to the resume endpoint without params by default", async () => {
    const result = await resumeRun("run_abc");

    expect(mockPost).toHaveBeenCalledWith("/runs/run_abc/resume", undefined, { params: undefined });
    expect(result).toEqual({ status: "queued" });
  });

  it("forwards force=true when requested", async () => {
    await resumeRun("run_abc", { force: true });

    expect(mockPost).toHaveBeenCalledWith("/runs/run_abc/resume", undefined, {
      params: { force: true },
    });
  });
});
