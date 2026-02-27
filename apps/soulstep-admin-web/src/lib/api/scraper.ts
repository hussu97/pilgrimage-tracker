import { apiClient } from "./client";
import type {
  CollectorStatus,
  CreateDataLocationBody,
  CreatePlaceTypeMappingBody,
  DataLocation,
  DiscoveryCellItem,
  PaginatedResponse,
  PatchPlaceTypeMappingBody,
  PlaceTypeMapping,
  RawCollectorEntry,
  RunActivity,
  ScrapedPlaceData,
  ScraperRun,
  ScraperStats,
} from "./types";

// ── Data Locations ─────────────────────────────────────────────────────────────

export async function listDataLocations(): Promise<DataLocation[]> {
  const res = await apiClient.get<DataLocation[]>("/admin/scraper/data-locations");
  return res.data;
}

export async function createDataLocation(body: CreateDataLocationBody): Promise<DataLocation> {
  const res = await apiClient.post<DataLocation>("/admin/scraper/data-locations", body);
  return res.data;
}

export async function deleteDataLocation(code: string): Promise<void> {
  await apiClient.delete(`/admin/scraper/data-locations/${code}`);
}

// ── Stats ──────────────────────────────────────────────────────────────────────

export async function getScraperStats(): Promise<ScraperStats> {
  const res = await apiClient.get<ScraperStats>("/admin/scraper/stats");
  return res.data;
}

// ── Runs ───────────────────────────────────────────────────────────────────────

export async function listRuns(params?: {
  page?: number;
  page_size?: number;
  status?: string;
  location_code?: string;
}): Promise<PaginatedResponse<ScraperRun>> {
  const res = await apiClient.get<PaginatedResponse<ScraperRun>>("/admin/scraper/runs", {
    params,
  });
  return res.data;
}

export async function startRun(locationCode: string): Promise<ScraperRun> {
  const res = await apiClient.post<ScraperRun>("/admin/scraper/runs", {
    location_code: locationCode,
  });
  return res.data;
}

export async function getRun(runCode: string): Promise<ScraperRun> {
  const res = await apiClient.get<ScraperRun>(`/admin/scraper/runs/${runCode}`);
  return res.data;
}

export async function getRunData(
  runCode: string,
  params?: { search?: string; page?: number; page_size?: number }
): Promise<PaginatedResponse<ScrapedPlaceData>> {
  const res = await apiClient.get<PaginatedResponse<ScrapedPlaceData>>(
    `/admin/scraper/runs/${runCode}/data`,
    { params }
  );
  return res.data;
}

export async function getRunRawData(
  runCode: string,
  params?: { collector?: string; place_code?: string }
): Promise<RawCollectorEntry[]> {
  const res = await apiClient.get<RawCollectorEntry[]>(
    `/admin/scraper/runs/${runCode}/raw-data`,
    { params }
  );
  return res.data;
}

export async function syncRun(runCode: string): Promise<unknown> {
  const res = await apiClient.post(`/admin/scraper/runs/${runCode}/sync`);
  return res.data;
}

export async function reEnrichRun(runCode: string): Promise<unknown> {
  const res = await apiClient.post(`/admin/scraper/runs/${runCode}/re-enrich`);
  return res.data;
}

export async function resumeRun(runCode: string): Promise<unknown> {
  const res = await apiClient.post(`/admin/scraper/runs/${runCode}/resume`);
  return res.data;
}

export async function cancelRun(runCode: string): Promise<unknown> {
  const res = await apiClient.post(`/admin/scraper/runs/${runCode}/cancel`);
  return res.data;
}

export async function deleteRun(runCode: string): Promise<void> {
  await apiClient.delete(`/admin/scraper/runs/${runCode}`);
}

export async function getRunActivity(runCode: string): Promise<RunActivity> {
  const res = await apiClient.get<RunActivity>(`/admin/scraper/runs/${runCode}/activity`);
  return res.data;
}

export async function getRunCells(
  runCode: string,
  params?: { page?: number; page_size?: number }
): Promise<PaginatedResponse<DiscoveryCellItem>> {
  const res = await apiClient.get<PaginatedResponse<DiscoveryCellItem>>(
    `/admin/scraper/runs/${runCode}/cells`,
    { params }
  );
  return res.data;
}

// ── Collectors ─────────────────────────────────────────────────────────────────

export async function listCollectors(): Promise<CollectorStatus[]> {
  const res = await apiClient.get<CollectorStatus[]>("/admin/scraper/collectors");
  return res.data;
}

// ── Place Type Mappings ────────────────────────────────────────────────────────

export async function listPlaceTypeMappings(params?: {
  religion?: string;
  is_active?: boolean;
}): Promise<PlaceTypeMapping[]> {
  const res = await apiClient.get<PlaceTypeMapping[]>("/admin/scraper/place-type-mappings", {
    params,
  });
  return res.data;
}

export async function createPlaceTypeMapping(
  body: CreatePlaceTypeMappingBody
): Promise<PlaceTypeMapping> {
  const res = await apiClient.post<PlaceTypeMapping>(
    "/admin/scraper/place-type-mappings",
    body
  );
  return res.data;
}

export async function updatePlaceTypeMapping(
  id: number,
  body: PatchPlaceTypeMappingBody
): Promise<PlaceTypeMapping> {
  const res = await apiClient.put<PlaceTypeMapping>(
    `/admin/scraper/place-type-mappings/${id}`,
    body
  );
  return res.data;
}

export async function deletePlaceTypeMapping(id: number): Promise<void> {
  await apiClient.delete(`/admin/scraper/place-type-mappings/${id}`);
}
