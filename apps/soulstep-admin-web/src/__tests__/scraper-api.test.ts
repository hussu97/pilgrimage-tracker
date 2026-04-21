import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGet, mockPost, mockPut, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  scraperClient: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
  },
}));

import {
  cancelRun,
  createDataLocation,
  createPlaceTypeMapping,
  deleteDataLocation,
  deletePlaceTypeMapping,
  deleteRun,
  getMapCells,
  getMapPlaces,
  getPlaceQualityBreakdown,
  getQualityMetrics,
  getRun,
  getRunActivity,
  getRunCells,
  getRunData,
  getRunRawData,
  getScraperStats,
  listCollectors,
  listDataLocations,
  listPlaceTypeMappings,
  listRuns,
  reEnrichRun,
  resumeRun,
  retryFailedImages,
  retryRunImages,
  startRun,
  syncRun,
  updatePlaceTypeMapping,
} from "@/lib/api/scraper";

describe("scraper api client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("covers GET wrappers", async () => {
    mockGet
      .mockResolvedValueOnce({ data: [{ code: "loc_1" }] })
      .mockResolvedValueOnce({ data: { total_runs: 3 } })
      .mockResolvedValueOnce({ data: { items: [], total: 0 } })
      .mockResolvedValueOnce({ data: { run_code: "run_1" } })
      .mockResolvedValueOnce({ data: { items: [], page: 2 } })
      .mockResolvedValueOnce({ data: [{ collector: "osm" }] })
      .mockResolvedValueOnce({ data: { stage: "detail_fetch" } })
      .mockResolvedValueOnce({ data: { items: [], page: 1 } })
      .mockResolvedValueOnce({ data: [{ name: "wikipedia" }] })
      .mockResolvedValueOnce({ data: [{ id: 7 }] })
      .mockResolvedValueOnce({ data: { avg_score: 0.91 } })
      .mockResolvedValueOnce({ data: { total_score: 0.88 } })
      .mockResolvedValueOnce({ data: [{ cell_id: "c1" }] })
      .mockResolvedValueOnce({ data: [{ place_code: "plc_1" }] });

    await expect(listDataLocations()).resolves.toEqual([{ code: "loc_1" }]);
    await expect(getScraperStats()).resolves.toEqual({ total_runs: 3 });
    await expect(listRuns({ page: 1, page_size: 50, status: "running" })).resolves.toEqual({
      items: [],
      total: 0,
    });
    await expect(getRun("run_1")).resolves.toEqual({ run_code: "run_1" });
    await expect(
      getRunData("run_1", { search: "mosque", page: 2, page_size: 25 })
    ).resolves.toEqual({
      items: [],
      page: 2,
    });
    await expect(getRunRawData("run_1", { collector: "osm", place_code: "plc_1" })).resolves.toEqual(
      [{ collector: "osm" }]
    );
    await expect(getRunActivity("run_1")).resolves.toEqual({ stage: "detail_fetch" });
    await expect(getRunCells("run_1", { page: 1, page_size: 10 })).resolves.toEqual({
      items: [],
      page: 1,
    });
    await expect(listCollectors()).resolves.toEqual([{ name: "wikipedia" }]);
    await expect(
      listPlaceTypeMappings({ religion: "islam", is_active: true })
    ).resolves.toEqual([{ id: 7 }]);
    await expect(getQualityMetrics({ run_code: "run_1" })).resolves.toEqual({ avg_score: 0.91 });
    await expect(getPlaceQualityBreakdown("run_1", "plc_1")).resolves.toEqual({
      total_score: 0.88,
    });
    await expect(getMapCells({ run_code: "run_1" })).resolves.toEqual([{ cell_id: "c1" }]);
    await expect(getMapPlaces({ run_code: "run_1" })).resolves.toEqual([{ place_code: "plc_1" }]);

    expect(mockGet).toHaveBeenNthCalledWith(1, "/data-locations");
    expect(mockGet).toHaveBeenNthCalledWith(2, "/stats");
    expect(mockGet).toHaveBeenNthCalledWith(3, "/runs", {
      params: { page: 1, page_size: 50, status: "running" },
    });
    expect(mockGet).toHaveBeenNthCalledWith(4, "/runs/run_1");
    expect(mockGet).toHaveBeenNthCalledWith(5, "/runs/run_1/data", {
      params: { search: "mosque", page: 2, page_size: 25 },
    });
    expect(mockGet).toHaveBeenNthCalledWith(6, "/runs/run_1/raw-data", {
      params: { collector: "osm", place_code: "plc_1" },
    });
    expect(mockGet).toHaveBeenNthCalledWith(7, "/runs/run_1/activity");
    expect(mockGet).toHaveBeenNthCalledWith(8, "/runs/run_1/cells", {
      params: { page: 1, page_size: 10 },
    });
    expect(mockGet).toHaveBeenNthCalledWith(9, "/collectors");
    expect(mockGet).toHaveBeenNthCalledWith(10, "/place-type-mappings", {
      params: { religion: "islam", is_active: true },
    });
    expect(mockGet).toHaveBeenNthCalledWith(11, "/quality-metrics", {
      params: { run_code: "run_1" },
    });
    expect(mockGet).toHaveBeenNthCalledWith(
      12,
      "/runs/run_1/places/plc_1/quality-breakdown"
    );
    expect(mockGet).toHaveBeenNthCalledWith(13, "/map/cells", {
      params: { run_code: "run_1" },
    });
    expect(mockGet).toHaveBeenNthCalledWith(14, "/map/places", {
      params: { run_code: "run_1" },
    });
  });

  it("covers POST wrappers", async () => {
    mockPost
      .mockResolvedValueOnce({ data: { code: "loc_new" } })
      .mockResolvedValueOnce({ data: { runs: [{ run_code: "run_new" }] } })
      .mockResolvedValueOnce({ data: { status: "sync_started" } })
      .mockResolvedValueOnce({ data: { status: "sync_started_failed_only" } })
      .mockResolvedValueOnce({ data: { status: "re_enrichment_started" } })
      .mockResolvedValueOnce({ data: { status: "queued" } })
      .mockResolvedValueOnce({ data: { status: "queued_force" } })
      .mockResolvedValueOnce({ data: { status: "retrying" } })
      .mockResolvedValueOnce({ data: { status: "cancelled" } })
      .mockResolvedValueOnce({ data: { id: 9 } })
      .mockResolvedValueOnce({ data: { status: "cleanup_started", message: "ok" } });

    await expect(createDataLocation({ name: "Dubai" } as never)).resolves.toEqual({
      code: "loc_new",
    });
    await expect(startRun("loc_1")).resolves.toEqual({ runs: [{ run_code: "run_new" }] });
    await expect(syncRun("run_1")).resolves.toEqual({ status: "sync_started" });
    await expect(syncRun("run_1", { failedOnly: true })).resolves.toEqual({
      status: "sync_started_failed_only",
    });
    await expect(reEnrichRun("run_1")).resolves.toEqual({ status: "re_enrichment_started" });
    await expect(resumeRun("run_1")).resolves.toEqual({ status: "queued" });
    await expect(resumeRun("run_1", { force: true })).resolves.toEqual({
      status: "queued_force",
    });
    await expect(retryRunImages("run_1")).resolves.toEqual({ status: "retrying" });
    await expect(cancelRun("run_1")).resolves.toEqual({ status: "cancelled" });
    await expect(createPlaceTypeMapping({ source_type: "gmaps" } as never)).resolves.toEqual({
      id: 9,
    });
    await expect(retryFailedImages()).resolves.toEqual({
      status: "cleanup_started",
      message: "ok",
    });

    expect(mockPost).toHaveBeenNthCalledWith(1, "/data-locations", { name: "Dubai" });
    expect(mockPost).toHaveBeenNthCalledWith(2, "/runs", { location_code: "loc_1" });
    expect(mockPost).toHaveBeenNthCalledWith(3, "/runs/run_1/sync", undefined, {
      params: undefined,
    });
    expect(mockPost).toHaveBeenNthCalledWith(4, "/runs/run_1/sync", undefined, {
      params: { failed_only: true },
    });
    expect(mockPost).toHaveBeenNthCalledWith(5, "/runs/run_1/re-enrich");
    expect(mockPost).toHaveBeenNthCalledWith(6, "/runs/run_1/resume", undefined, {
      params: undefined,
    });
    expect(mockPost).toHaveBeenNthCalledWith(7, "/runs/run_1/resume", undefined, {
      params: { force: true },
    });
    expect(mockPost).toHaveBeenNthCalledWith(8, "/runs/run_1/retry-images");
    expect(mockPost).toHaveBeenNthCalledWith(9, "/runs/run_1/cancel");
    expect(mockPost).toHaveBeenNthCalledWith(10, "/place-type-mappings", {
      source_type: "gmaps",
    });
    expect(mockPost).toHaveBeenNthCalledWith(11, "/cleanup/images");
  });

  it("covers PUT and DELETE wrappers", async () => {
    mockPut.mockResolvedValueOnce({ data: { id: 7, is_active: false } });
    mockDelete.mockResolvedValue(undefined);

    await expect(updatePlaceTypeMapping(7, { is_active: false })).resolves.toEqual({
      id: 7,
      is_active: false,
    });
    await expect(deleteDataLocation("loc_1")).resolves.toBeUndefined();
    await expect(deleteRun("run_1")).resolves.toBeUndefined();
    await expect(deleteRun("run_1", true)).resolves.toBeUndefined();
    await expect(deletePlaceTypeMapping(7)).resolves.toBeUndefined();

    expect(mockPut).toHaveBeenCalledWith("/place-type-mappings/7", { is_active: false });
    expect(mockDelete).toHaveBeenNthCalledWith(1, "/data-locations/loc_1");
    expect(mockDelete).toHaveBeenNthCalledWith(2, "/runs/run_1", {
      params: undefined,
    });
    expect(mockDelete).toHaveBeenNthCalledWith(3, "/runs/run_1", {
      params: { delete_catalog_places: true },
    });
    expect(mockDelete).toHaveBeenNthCalledWith(4, "/place-type-mappings/7");
  });
});
