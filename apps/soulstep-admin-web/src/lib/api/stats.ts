import { apiClient } from "./client";
import type {
  GrowthDataPoint,
  OverviewStats,
  PopularPlace,
  RecentActivityItem,
  ReligionBreakdownItem,
  ReviewStats,
} from "./types";

export async function getOverviewStats(): Promise<OverviewStats> {
  const res = await apiClient.get<OverviewStats>("/admin/stats/overview");
  return res.data;
}

export async function getUserGrowth(
  interval: "day" | "week" | "month" = "day"
): Promise<GrowthDataPoint[]> {
  const res = await apiClient.get<GrowthDataPoint[]>("/admin/stats/user-growth", {
    params: { interval },
  });
  return res.data;
}

export async function getPopularPlaces(): Promise<PopularPlace[]> {
  const res = await apiClient.get<PopularPlace[]>("/admin/stats/popular-places");
  return res.data;
}

export async function getReligionBreakdown(): Promise<ReligionBreakdownItem[]> {
  const res = await apiClient.get<ReligionBreakdownItem[]>("/admin/stats/religion-breakdown");
  return res.data;
}

export async function getRecentActivity(): Promise<RecentActivityItem[]> {
  const res = await apiClient.get<RecentActivityItem[]>("/admin/stats/recent-activity");
  return res.data;
}

export async function getReviewStats(): Promise<ReviewStats> {
  const res = await apiClient.get<ReviewStats>("/admin/stats/review-stats");
  return res.data;
}
