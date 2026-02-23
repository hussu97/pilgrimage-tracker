import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatCard } from "@/components/shared/StatCard";
import {
  getOverviewStats,
  getPopularPlaces,
  getRecentActivity,
  getReligionBreakdown,
  getReviewStats,
  getUserGrowth,
} from "@/lib/api/stats";
import type {
  GrowthDataPoint,
  OverviewStats,
  PopularPlace,
  RecentActivityItem,
  ReligionBreakdownItem,
  ReviewStats,
} from "@/lib/api/types";

// ── Chart constants ────────────────────────────────────────────────────────────

const RELIGION_COLORS: Record<string, string> = {
  islam: "#10b981",
  hinduism: "#f59e0b",
  christianity: "#3b82f6",
  judaism: "#8b5cf6",
  sikhism: "#ef4444",
  buddhism: "#ec4899",
};

const RATING_COLORS = ["#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e"];

const TOOLTIP_STYLE = {
  backgroundColor: "#1f2937",
  border: "1px solid #374151",
  borderRadius: "8px",
  color: "#f9fafb",
  fontSize: "12px",
};

function religionColor(religion: string): string {
  return RELIGION_COLORS[religion.toLowerCase()] ?? "#6366f1";
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPeriodLabel(period: string, interval: "day" | "week" | "month"): string {
  if (interval === "day") {
    const [, month, day] = period.split("-");
    return `${month}/${day}`;
  }
  if (interval === "week") {
    return period.replace(/^\d{4}-/, "");
  }
  // month: "2024-01" → "Jan 24"
  const [year, month] = period.split("-");
  return new Date(Number(year), Number(month) - 1).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

function timeAgo(isoTimestamp: string): string {
  const diff = Date.now() - new Date(isoTimestamp).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function activityText(item: RecentActivityItem): string {
  const name = item.user_display_name ?? "Unknown";
  if (item.type === "check_in") return `${name} checked in at ${item.place_name ?? "a place"}`;
  if (item.type === "review") return `${name} reviewed ${item.place_name ?? "a place"}`;
  return `${name} joined ${item.group_name ?? "a group"}`;
}

// ── Card wrapper (shared panel style) ─────────────────────────────────────────

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-5 ${className}`}
    >
      {children}
    </div>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-text-main dark:text-white mb-4">{children}</h3>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function DashboardPage() {
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [growth, setGrowth] = useState<GrowthDataPoint[]>([]);
  const [growthInterval, setGrowthInterval] = useState<"day" | "week" | "month">("day");
  const [religions, setReligions] = useState<ReligionBreakdownItem[]>([]);
  const [popularPlaces, setPopularPlaces] = useState<PopularPlace[]>([]);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  const [activity, setActivity] = useState<RecentActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial load of all sections in parallel
  useEffect(() => {
    Promise.all([
      getOverviewStats(),
      getUserGrowth("day"),
      getReligionBreakdown(),
      getPopularPlaces(),
      getReviewStats(),
      getRecentActivity(),
    ])
      .then(([o, g, r, p, rs, a]) => {
        setOverview(o);
        setGrowth(g);
        setReligions(r);
        setPopularPlaces(p);
        setReviewStats(rs);
        setActivity(a);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load dashboard data.");
        setLoading(false);
      });
  }, []);

  // Reload growth when interval changes
  useEffect(() => {
    getUserGrowth(growthInterval).then(setGrowth).catch(() => {});
  }, [growthInterval]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary animate-pulse">
          Loading dashboard…
        </p>
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-500">{error}</p>;
  }

  // Recharts-ready data
  const chartGrowth = growth.map((d) => ({
    period: formatPeriodLabel(d.period, growthInterval),
    count: d.count,
  }));

  const ratingData = reviewStats
    ? [1, 2, 3, 4, 5].map((r) => ({
        rating: `${r}★`,
        count: reviewStats.rating_histogram[String(r)] ?? 0,
      }))
    : [];

  return (
    <div className="space-y-6">
      {/* ── Row 1: Stat Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label="Users" value={(overview?.total_users ?? 0).toLocaleString()} />
        <StatCard label="Places" value={(overview?.total_places ?? 0).toLocaleString()} />
        <StatCard label="Reviews" value={(overview?.total_reviews ?? 0).toLocaleString()} />
        <StatCard label="Check-ins" value={(overview?.total_check_ins ?? 0).toLocaleString()} />
        <StatCard label="Groups" value={(overview?.total_groups ?? 0).toLocaleString()} />
        <StatCard
          label="Active (30d)"
          value={(overview?.active_users_30d ?? 0).toLocaleString()}
        />
      </div>

      {/* ── Row 2: User Growth + Religion Breakdown ────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* User Growth */}
        <Panel>
          <div className="flex items-center justify-between mb-4">
            <PanelTitle>User Growth</PanelTitle>
            <div className="flex gap-1">
              {(["day", "week", "month"] as const).map((iv) => (
                <button
                  key={iv}
                  onClick={() => setGrowthInterval(iv)}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    growthInterval === iv
                      ? "bg-indigo-600 text-white"
                      : "text-text-secondary dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-dark-bg"
                  }`}
                >
                  {iv.charAt(0).toUpperCase() + iv.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartGrowth} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#374151"
                strokeOpacity={0.3}
              />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#6366f1" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        {/* Religion Breakdown */}
        <Panel>
          <PanelTitle>Religion Breakdown</PanelTitle>
          {religions.length === 0 ? (
            <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
              No places yet.
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={religions}
                      dataKey="place_count"
                      nameKey="religion"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                    >
                      {religions.map((entry) => (
                        <Cell key={entry.religion} fill={religionColor(entry.religion)} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value: number | undefined, name: string | undefined) => [
                        `${value ?? 0} places`,
                        name ?? "",
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-2.5 shrink-0">
                {religions.map((r) => (
                  <div key={r.religion} className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: religionColor(r.religion) }}
                    />
                    <span className="text-xs text-text-secondary dark:text-dark-text-secondary capitalize">
                      {r.religion}
                    </span>
                    <span className="text-xs font-semibold text-text-main dark:text-white ml-2 tabular-nums">
                      {r.place_count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* ── Row 3: Popular Places + Review Rating ──────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Popular Places */}
        <Panel>
          <PanelTitle>Top Places by Check-ins</PanelTitle>
          {popularPlaces.length === 0 ? (
            <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
              No places yet.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={popularPlaces.slice(0, 10)}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 4, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#374151"
                  strokeOpacity={0.3}
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickLine={false}
                  width={96}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="check_in_count" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* Review Rating Distribution */}
        <Panel>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-main dark:text-white">
              Review Rating Distribution
            </h3>
            <div className="text-right">
              <p className="text-xs text-text-secondary dark:text-dark-text-secondary">
                Avg rating
              </p>
              <p className="text-xl font-semibold text-text-main dark:text-white tabular-nums">
                {reviewStats?.avg_rating != null
                  ? reviewStats.avg_rating.toFixed(1)
                  : "—"}
              </p>
            </div>
          </div>
          {(reviewStats?.total_reviews ?? 0) === 0 ? (
            <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
              No reviews yet.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={ratingData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#374151"
                  strokeOpacity={0.3}
                />
                <XAxis
                  dataKey="rating"
                  tick={{ fontSize: 12, fill: "#9ca3af" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {ratingData.map((_, index) => (
                    <Cell key={index} fill={RATING_COLORS[index]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      {/* ── Row 4: Recent Activity ─────────────────────────────────────────── */}
      <Panel>
        <PanelTitle>Recent Activity</PanelTitle>
        {activity.length === 0 ? (
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            No activity yet.
          </p>
        ) : (
          <div className="space-y-3">
            {activity.slice(0, 20).map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    {(item.user_display_name ?? "?").charAt(0).toUpperCase()}
                  </span>
                </div>
                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-main dark:text-white truncate">
                    {activityText(item)}
                  </p>
                  <p className="text-xs text-text-secondary dark:text-dark-text-secondary mt-0.5">
                    {timeAgo(item.timestamp)}
                  </p>
                </div>
                {/* Badge */}
                <span
                  className={`text-xs px-2 py-0.5 rounded-full shrink-0 font-medium ${
                    item.type === "check_in"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : item.type === "review"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                  }`}
                >
                  {item.type === "check_in"
                    ? "Check-in"
                    : item.type === "review"
                      ? "Review"
                      : "Joined"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
