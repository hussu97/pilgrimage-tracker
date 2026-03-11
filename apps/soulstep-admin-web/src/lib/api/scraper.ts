import { scraperClient } from "./client";
import type {
  CollectorStatus,
  CreateDataLocationBody,
  CreatePlaceTypeMappingBody,
  DataLocation,
  DiscoveryCellItem,
  PaginatedResponse,
  PatchPlaceTypeMappingBody,
  PlaceTypeMapping,
  QualityBreakdown,
  QualityMetrics,
  RawCollectorEntry,
  RunActivity,
  ScrapedPlaceData,
  ScraperRun,
  ScraperStats,
} from "./types";

// ── Data Locations ─────────────────────────────────────────────────────────────

export async function listDataLocations(): Promise<DataLocation[]> {
  const res = await scraperClient.get<DataLocation[]>("/data-locations");
  return res.data;
}

export async function createDataLocation(body: CreateDataLocationBody): Promise<DataLocation> {
  const res = await scraperClient.post<DataLocation>("/data-locations", body);
  return res.data;
}

export async function deleteDataLocation(code: string): Promise<void> {
  await scraperClient.delete(`/data-locations/${code}`);
}

// ── Stats ──────────────────────────────────────────────────────────────────────

export async function getScraperStats(): Promise<ScraperStats> {
  const res = await scraperClient.get<ScraperStats>("/stats");
  return res.data;
}

// ── Runs ───────────────────────────────────────────────────────────────────────

export async function listRuns(params?: {
  page?: number;
  page_size?: number;
  status?: string;
  location_code?: string;
}): Promise<PaginatedResponse<ScraperRun>> {
  const res = await scraperClient.get<PaginatedResponse<ScraperRun>>("/runs", {
    params,
  });
  return res.data;
}

export async function startRun(locationCode: string): Promise<ScraperRun> {
  const res = await scraperClient.post<ScraperRun>("/runs", {
    location_code: locationCode,
  });
  return res.data;
}

export async function getRun(runCode: string): Promise<ScraperRun> {
  const res = await scraperClient.get<ScraperRun>(`/runs/${runCode}`);
  return res.data;
}

export async function getRunData(
  runCode: string,
  params?: { search?: string; page?: number; page_size?: number }
): Promise<PaginatedResponse<ScrapedPlaceData>> {
  const res = await scraperClient.get<PaginatedResponse<ScrapedPlaceData>>(
    `/runs/${runCode}/data`,
    { params }
  );
  return res.data;
}

export async function getRunRawData(
  runCode: string,
  params?: { collector?: string; place_code?: string }
): Promise<RawCollectorEntry[]> {
  const res = await scraperClient.get<RawCollectorEntry[]>(
    `/runs/${runCode}/raw-data`,
    { params }
  );
  return res.data;
}

export async function syncRun(runCode: string): Promise<unknown> {
  const res = await scraperClient.post(`/runs/${runCode}/sync`);
  return res.data;
}

export async function reEnrichRun(runCode: string): Promise<unknown> {
  const res = await scraperClient.post(`/runs/${runCode}/re-enrich`);
  return res.data;
}

export async function resumeRun(runCode: string): Promise<unknown> {
  const res = await scraperClient.post(`/runs/${runCode}/resume`);
  return res.data;
}

export async function cancelRun(runCode: string): Promise<unknown> {
  const res = await scraperClient.post(`/runs/${runCode}/cancel`);
  return res.data;
}

export async function deleteRun(runCode: string): Promise<void> {
  await scraperClient.delete(`/runs/${runCode}`);
}

export async function getRunActivity(runCode: string): Promise<RunActivity> {
  const res = await scraperClient.get<RunActivity>(`/runs/${runCode}/activity`);
  return res.data;
}

export async function getRunCells(
  runCode: string,
  params?: { page?: number; page_size?: number }
): Promise<PaginatedResponse<DiscoveryCellItem>> {
  const res = await scraperClient.get<PaginatedResponse<DiscoveryCellItem>>(
    `/runs/${runCode}/cells`,
    { params }
  );
  return res.data;
}

// ── Collectors ─────────────────────────────────────────────────────────────────

export async function listCollectors(): Promise<CollectorStatus[]> {
  const res = await scraperClient.get<CollectorStatus[]>("/collectors");
  return res.data;
}

// ── Place Type Mappings ────────────────────────────────────────────────────────

export async function listPlaceTypeMappings(params?: {
  religion?: string;
  is_active?: boolean;
}): Promise<PlaceTypeMapping[]> {
  const res = await scraperClient.get<PlaceTypeMapping[]>("/place-type-mappings", {
    params,
  });
  return res.data;
}

export async function createPlaceTypeMapping(
  body: CreatePlaceTypeMappingBody
): Promise<PlaceTypeMapping> {
  const res = await scraperClient.post<PlaceTypeMapping>(
    "/place-type-mappings",
    body
  );
  return res.data;
}

export async function updatePlaceTypeMapping(
  id: number,
  body: PatchPlaceTypeMappingBody
): Promise<PlaceTypeMapping> {
  const res = await scraperClient.put<PlaceTypeMapping>(
    `/place-type-mappings/${id}`,
    body
  );
  return res.data;
}

export async function deletePlaceTypeMapping(id: number): Promise<void> {
  await scraperClient.delete(`/place-type-mappings/${id}`);
}

// ── Quality Metrics ────────────────────────────────────────────────────────────

export async function getQualityMetrics(params?: { run_code?: string }): Promise<QualityMetrics> {
  const res = await scraperClient.get<QualityMetrics>("/quality-metrics", { params });
  return res.data;
}

export async function getPlaceQualityBreakdown(
  runCode: string,
  placeCode: string
): Promise<QualityBreakdown> {
  const res = await scraperClient.get<QualityBreakdown>(
    `/runs/${runCode}/places/${placeCode}/quality-breakdown`
  );
  return res.data;
}
