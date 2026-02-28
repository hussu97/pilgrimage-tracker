import { apiClient } from "./client";
import type {
  AnalyticsEventListResponse,
  AnalyticsOverview,
  AnalyticsTopPlace,
  AnalyticsTrendPoint,
} from "./types";

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  const res = await apiClient.get<AnalyticsOverview>("/admin/analytics/overview");
  return res.data;
}

export async function getAnalyticsTopPlaces(
  period: "24h" | "7d" | "30d" | "90d" = "7d",
  limit = 20
): Promise<AnalyticsTopPlace[]> {
  const res = await apiClient.get<AnalyticsTopPlace[]>("/admin/analytics/top-places", {
    params: { period, limit },
  });
  return res.data;
}

export async function getAnalyticsTrends(
  interval: "day" | "week" | "month" = "day",
  period: "7d" | "30d" | "90d" | "365d" = "30d",
  event_type?: string
): Promise<AnalyticsTrendPoint[]> {
  const res = await apiClient.get<AnalyticsTrendPoint[]>("/admin/analytics/trends", {
    params: { interval, period, ...(event_type ? { event_type } : {}) },
  });
  return res.data;
}

export async function getAnalyticsEvents(params: {
  page?: number;
  page_size?: number;
  event_type?: string;
  platform?: string;
  user_code?: string;
  session_id?: string;
  date_from?: string;
  date_to?: string;
}): Promise<AnalyticsEventListResponse> {
  const res = await apiClient.get<AnalyticsEventListResponse>("/admin/analytics/events", {
    params,
  });
  return res.data;
}
