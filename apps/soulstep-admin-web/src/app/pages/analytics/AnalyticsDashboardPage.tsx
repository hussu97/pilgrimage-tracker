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
  getAnalyticsEvents,
  getAnalyticsOverview,
  getAnalyticsTopPlaces,
  getAnalyticsTrends,
} from "@/lib/api/analytics";
import { Pagination } from "@/components/shared/Pagination";
import { usePagination } from "@/lib/hooks/usePagination";
import type {
  AnalyticsEventListItem,
  AnalyticsOverview,
  AnalyticsTopPlace,
  AnalyticsTrendPoint,
} from "@/lib/api/types";

// ── Chart constants ────────────────────────────────────────────────────────────

const PLATFORM_COLORS: Record<string, string> = {
  web: "#6366f1",
  ios: "#3b82f6",
  android: "#10b981",
};

const EVENT_TYPE_COLORS = [
  "#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#06b6d4",
];

const TOOLTIP_STYLE = {
  backgroundColor: "#1f2937",
  border: "1px solid #374151",
  borderRadius: "8px",
  color: "#f9fafb",
  fontSize: "12px",
};

function platformColor(platform: string): string {
  return PLATFORM_COLORS[platform.toLowerCase()] ?? "#6366f1";
}

// ── Panel ────────────────────────────────────────────────────────────────────

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-5 ${className}`}>
      {children}
    </div>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-text-main dark:text-white mb-4">{children}</h3>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function AnalyticsDashboardPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [trends, setTrends] = useState<AnalyticsTrendPoint[]>([]);
  const [trendInterval, setTrendInterval] = useState<"day" | "week" | "month">("day");
  const [trendPeriod, setTrendPeriod] = useState<"7d" | "30d" | "90d" | "365d">("30d");
  const [topPlaces, setTopPlaces] = useState<AnalyticsTopPlace[]>([]);
  const [events, setEvents] = useState<AnalyticsEventListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterEventType, setFilterEventType] = useState("");
  const [filterPlatform, setFilterPlatform] = useState("");

  const { page, pageSize, setPage, setPageSize } = usePagination(50);

  // Initial load
  useEffect(() => {
    setLoading(true);
    Promise.all([
      getAnalyticsOverview(),
      getAnalyticsTrends("day", "30d"),
      getAnalyticsTopPlaces("7d", 10),
    ])
      .then(([o, t, p]) => {
        setOverview(o);
        setTrends(t);
        setTopPlaces(p);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load analytics data.");
        setLoading(false);
      });
  }, []);

  // Reload trends on interval/period change
  useEffect(() => {
    getAnalyticsTrends(trendInterval, trendPeriod)
      .then(setTrends)
      .catch(() => {});
  }, [trendInterval, trendPeriod]);

  // Reload paginated events
  useEffect(() => {
    getAnalyticsEvents({
      page,
      page_size: pageSize,
      event_type: filterEventType || undefined,
      platform: filterPlatform || undefined,
    })
      .then((r) => {
        setEvents(r.items);
        setTotal(r.total);
      })
      .catch(() => {});
  }, [page, pageSize, filterEventType, filterPlatform]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary animate-pulse">
          Loading analytics…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  const trendData = trends.map((t) => ({
    period: t.period,
    count: t.count,
  }));

  const eventTypeData = (overview?.top_event_types ?? []).map((e, i) => ({
    name: e.event_type.replace(/_/g, " "),
    value: e.count,
    color: EVENT_TYPE_COLORS[i % EVENT_TYPE_COLORS.length],
  }));

  const platformData = (overview?.platform_breakdown ?? []).map((p) => ({
    name: p.platform,
    value: p.count,
    color: platformColor(p.platform),
  }));

  const topPlaceData = topPlaces.slice(0, 10).map((p) => ({
    name: p.place_name.length > 20 ? p.place_name.slice(0, 20) + "…" : p.place_name,
    views: p.view_count,
    interactions: p.interaction_count,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-main dark:text-white">Analytics</h1>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-0.5">
          User behaviour and engagement metrics
        </p>
      </div>

      {/* Row 1: Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Total Events" value={overview?.total_events ?? 0} />
        <StatCard label="Events (24h)" value={overview?.total_events_24h ?? 0} />
        <StatCard label="Events (7d)" value={overview?.total_events_7d ?? 0} />
        <StatCard label="Unique Users" value={overview?.unique_users ?? 0} />
        <StatCard label="Unique Visitors" value={overview?.unique_visitors ?? 0} />
        <StatCard label="Sessions" value={overview?.unique_sessions ?? 0} />
      </div>

      {/* Row 2: Trend line + Event type pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <PanelTitle>Event Trends</PanelTitle>
            <div className="flex gap-2 flex-wrap">
              {(["7d", "30d", "90d", "365d"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setTrendPeriod(p)}
                  className={`text-xs px-2 py-1 rounded-md font-medium border transition-colors ${
                    trendPeriod === p
                      ? "bg-primary text-white border-primary"
                      : "border-input-border dark:border-dark-border text-text-secondary dark:text-dark-text-secondary"
                  }`}
                >
                  {p}
                </button>
              ))}
              <select
                value={trendInterval}
                onChange={(e) => setTrendInterval(e.target.value as "day" | "week" | "month")}
                className="text-xs border border-input-border dark:border-dark-border rounded-md px-2 py-1 bg-white dark:bg-dark-bg text-text-main dark:text-white"
              >
                <option value="day">Daily</option>
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
              </select>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.3} />
              <XAxis dataKey="period" tick={{ fontSize: 10 }} stroke="#6b7280" tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} stroke="#6b7280" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel>
          <PanelTitle>Event Type Breakdown</PanelTitle>
          {eventTypeData.length === 0 ? (
            <p className="text-sm text-text-secondary dark:text-dark-text-secondary text-center py-12">No data yet</p>
          ) : (
            <div className="flex flex-col md:flex-row items-center gap-4">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={eventTypeData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value">
                    {eventTypeData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [v, ""]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1.5 text-xs flex-1 min-w-0">
                {eventTypeData.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 truncate">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: e.color }} />
                    <span className="text-text-secondary dark:text-dark-text-secondary capitalize truncate">{e.name}</span>
                    <span className="ml-auto font-medium text-text-main dark:text-white shrink-0">{e.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* Row 3: Top places bar + Platform breakdown pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel>
          <PanelTitle>Top Places (7d)</PanelTitle>
          {topPlaceData.length === 0 ? (
            <p className="text-sm text-text-secondary dark:text-dark-text-secondary text-center py-12">No place data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topPlaceData} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.3} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} stroke="#6b7280" tickLine={false} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} stroke="#6b7280" tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="views" fill="#6366f1" name="Views" radius={[0, 4, 4, 0]} />
                <Bar dataKey="interactions" fill="#10b981" name="Interactions" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel>
          <PanelTitle>Platform Breakdown</PanelTitle>
          {platformData.length === 0 ? (
            <p className="text-sm text-text-secondary dark:text-dark-text-secondary text-center py-12">No data yet</p>
          ) : (
            <div className="flex flex-col md:flex-row items-center gap-4">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={platformData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value">
                    {platformData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2 text-xs flex-1">
                {platformData.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                    <span className="text-text-secondary dark:text-dark-text-secondary capitalize">{p.name}</span>
                    <span className="ml-auto font-medium text-text-main dark:text-white">{p.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* Row 4: Raw event log */}
      <Panel>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <PanelTitle>Event Log</PanelTitle>
          <div className="flex gap-2 flex-wrap">
            <select
              value={filterEventType}
              onChange={(e) => { setFilterEventType(e.target.value); setPage(1); }}
              className="text-xs border border-input-border dark:border-dark-border rounded-md px-2 py-1.5 bg-white dark:bg-dark-bg text-text-main dark:text-white"
            >
              <option value="">All event types</option>
              {["page_view","place_view","search","check_in","favorite_toggle","review_submit","share","filter_change","signup","login"].map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
            <select
              value={filterPlatform}
              onChange={(e) => { setFilterPlatform(e.target.value); setPage(1); }}
              className="text-xs border border-input-border dark:border-dark-border rounded-md px-2 py-1.5 bg-white dark:bg-dark-bg text-text-main dark:text-white"
            >
              <option value="">All platforms</option>
              <option value="web">web</option>
              <option value="ios">ios</option>
              <option value="android">android</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-input-border dark:border-dark-border">
                <th className="text-left py-2 pr-4 font-medium text-text-secondary dark:text-dark-text-secondary">Event Type</th>
                <th className="text-left py-2 pr-4 font-medium text-text-secondary dark:text-dark-text-secondary">Platform</th>
                <th className="text-left py-2 pr-4 font-medium text-text-secondary dark:text-dark-text-secondary">User / Visitor</th>
                <th className="text-left py-2 pr-4 font-medium text-text-secondary dark:text-dark-text-secondary">Session</th>
                <th className="text-left py-2 font-medium text-text-secondary dark:text-dark-text-secondary">Received</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-text-secondary dark:text-dark-text-secondary">
                    No events found
                  </td>
                </tr>
              ) : (
                events.map((ev) => (
                  <tr
                    key={ev.event_code}
                    className="border-b border-input-border dark:border-dark-border hover:bg-background-light dark:hover:bg-dark-bg transition-colors"
                  >
                    <td className="py-2 pr-4">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium capitalize">
                        {ev.event_type.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-text-secondary dark:text-dark-text-secondary capitalize">{ev.platform}</td>
                    <td className="py-2 pr-4 text-text-secondary dark:text-dark-text-secondary font-mono truncate max-w-[120px]">
                      {ev.user_code ?? ev.visitor_code ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-text-secondary dark:text-dark-text-secondary font-mono truncate max-w-[100px]">
                      {ev.session_id.slice(0, 8)}…
                    </td>
                    <td className="py-2 text-text-secondary dark:text-dark-text-secondary whitespace-nowrap">
                      {new Date(ev.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        />
      </Panel>
    </div>
  );
}
