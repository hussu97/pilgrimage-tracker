import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatCard } from "@/components/shared/StatCard";
import { Pagination } from "@/components/shared/Pagination";
import { usePagination } from "@/lib/hooks/usePagination";
import { getQualityMetrics } from "@/lib/api/scraper";
import { listRuns } from "@/lib/api/scraper";
import type { QualityMetrics, ScraperRun } from "@/lib/api/types";
import { formatGateLabel, formatScore, gateColor } from "@/lib/utils/qualityMetrics";
import { formatDate } from "@/lib/utils";

const TOOLTIP_STYLE = {
  backgroundColor: "#1f2937",
  border: "1px solid #374151",
  borderRadius: "8px",
  color: "#f9fafb",
  fontSize: "12px",
};

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

export function QualityMetricsPage() {
  const [metrics, setMetrics] = useState<QualityMetrics | null>(null);
  const [runs, setRuns] = useState<ScraperRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { page, pageSize, setPage, setPageSize } = usePagination(50);

  // Load runs for the dropdown
  useEffect(() => {
    listRuns({ page_size: 200 })
      .then((r) => setRuns(r.items))
      .catch(() => {});
  }, []);

  // Load quality metrics whenever selected run changes
  useEffect(() => {
    setLoading(true);
    setError(null);
    getQualityMetrics(selectedRun ? { run_code: selectedRun } : undefined)
      .then((data) => {
        setMetrics(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load quality metrics.");
        setLoading(false);
      });
  }, [selectedRun]);

  const paginatedRunSummary = metrics
    ? metrics.per_run_summary.slice((page - 1) * pageSize, page * pageSize)
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-main dark:text-white">Quality Metrics</h1>
        <select
          value={selectedRun}
          onChange={(e) => {
            setSelectedRun(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface text-text-main dark:text-white text-sm px-3 py-2"
        >
          <option value="">All Runs</option>
          {runs.map((r) => (
            <option key={r.run_code} value={r.run_code}>
              {r.run_code} — {r.status} ({formatDate(r.created_at)})
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-48">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary animate-pulse">
            Loading quality metrics…
          </p>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {metrics && !loading && (
        <>
          {/* Row 1: Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Total Scraped"
              value={String(metrics.overall_stats.total_scraped)}
            />
            <StatCard
              label="Total Synced"
              value={String(metrics.overall_stats.total_synced)}
            />
            <StatCard
              label="Filter Rate"
              value={`${metrics.overall_stats.overall_filter_rate_pct}%`}
            />
            <StatCard
              label="Avg Score"
              value={formatScore(metrics.avg_quality_score)}
            />
          </div>

          {/* Row 2: Score Distribution + Gate Funnel */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Panel>
              <PanelTitle>Score Distribution</PanelTitle>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={metrics.score_distribution} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                  <XAxis
                    dataKey="bucket"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={40}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="count" fill="#6366f1" radius={[3, 3, 0, 0]} />
                  <ReferenceLine x="0.2-0.3" stroke="#ef4444" strokeDasharray="4 2" label={{ value: "0.20", fill: "#ef4444", fontSize: 10 }} />
                  <ReferenceLine x="0.3-0.4" stroke="#f59e0b" strokeDasharray="4 2" label={{ value: "0.35", fill: "#f59e0b", fontSize: 10 }} />
                  <ReferenceLine x="0.4-0.5" stroke="#f97316" strokeDasharray="4 2" label={{ value: "0.40", fill: "#f97316", fontSize: 10 }} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel>
              <PanelTitle>Gate Funnel</PanelTitle>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={metrics.gate_breakdown} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                  <XAxis
                    dataKey="gate"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    tickFormatter={formatGateLabel}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value, _name, props) => [value, formatGateLabel(props.payload.gate as string)]}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {metrics.gate_breakdown.map((entry) => (
                      <Cell key={entry.gate} fill={gateColor(entry.gate)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          {/* Row 3: Pie Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Panel>
              <PanelTitle>Description Source</PanelTitle>
              {metrics.description_source_breakdown.length === 0 ? (
                <p className="text-sm text-text-secondary dark:text-dark-text-secondary">No data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={metrics.description_source_breakdown}
                      dataKey="count"
                      nameKey="source"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      label={({ name, percent }) =>
                        `${name} ${((percent as number) * 100).toFixed(0)}%`
                      }
                    >
                      {metrics.description_source_breakdown.map((entry, i) => (
                        <Cell
                          key={entry.source}
                          fill={["#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"][i % 7]}
                        />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel>
              <PanelTitle>Enrichment Status</PanelTitle>
              {metrics.enrichment_status_breakdown.length === 0 ? (
                <p className="text-sm text-text-secondary dark:text-dark-text-secondary">No data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={metrics.enrichment_status_breakdown}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      label={({ name, percent }) =>
                        `${name} ${((percent as number) * 100).toFixed(0)}%`
                      }
                    >
                      {metrics.enrichment_status_breakdown.map((entry, i) => (
                        <Cell
                          key={entry.status}
                          fill={["#10b981", "#6366f1", "#f59e0b", "#ef4444", "#3b82f6"][i % 5]}
                        />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>

          {/* Row 4: Near-threshold Sensitivity */}
          <Panel>
            <PanelTitle>Near-Threshold Sensitivity (±0.05 band)</PanelTitle>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-secondary dark:text-dark-text-secondary border-b border-input-border dark:border-dark-border">
                  <th className="pb-2 pr-4 font-medium">Gate</th>
                  <th className="pb-2 pr-4 font-medium">Threshold</th>
                  <th className="pb-2 font-medium">Places in Band</th>
                </tr>
              </thead>
              <tbody>
                {metrics.near_threshold_counts.map((row) => (
                  <tr
                    key={row.gate}
                    className="border-b border-input-border dark:border-dark-border last:border-0"
                  >
                    <td className="py-2 pr-4">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full mr-2"
                        style={{ backgroundColor: gateColor(row.gate) }}
                      />
                      {formatGateLabel(row.gate)}
                    </td>
                    <td className="py-2 pr-4 text-text-secondary dark:text-dark-text-secondary">
                      {row.threshold.toFixed(2)}
                    </td>
                    <td className="py-2 font-semibold text-text-main dark:text-white">
                      {row.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          {/* Row 5: Per-run Summary */}
          <Panel>
            <PanelTitle>Per-Run Summary</PanelTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-secondary dark:text-dark-text-secondary border-b border-input-border dark:border-dark-border">
                    <th className="pb-2 pr-4 font-medium">Run</th>
                    <th className="pb-2 pr-4 font-medium">Location</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Scraped</th>
                    <th className="pb-2 pr-4 font-medium">Passed</th>
                    <th className="pb-2 pr-4 font-medium">Avg Score</th>
                    <th className="pb-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRunSummary.map((run) => (
                    <tr
                      key={run.run_code}
                      className="border-b border-input-border dark:border-dark-border last:border-0 hover:bg-background-light dark:hover:bg-dark-bg transition-colors"
                    >
                      <td className="py-2 pr-4 font-mono text-xs text-text-main dark:text-white">
                        {run.run_code}
                      </td>
                      <td className="py-2 pr-4 text-text-secondary dark:text-dark-text-secondary">
                        {run.location_name ?? "—"}
                      </td>
                      <td className="py-2 pr-4">
                        <span className="capitalize text-text-secondary dark:text-dark-text-secondary">
                          {run.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-text-main dark:text-white">{run.total_scraped}</td>
                      <td className="py-2 pr-4 text-text-main dark:text-white">{run.total_passed}</td>
                      <td className="py-2 pr-4 text-text-main dark:text-white">
                        {formatScore(run.avg_score)}
                      </td>
                      <td className="py-2 text-text-secondary dark:text-dark-text-secondary">
                        {formatDate(run.created_at)}
                      </td>
                    </tr>
                  ))}
                  {paginatedRunSummary.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-6 text-center text-text-secondary dark:text-dark-text-secondary"
                      >
                        No runs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={metrics.per_run_summary.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </Panel>
        </>
      )}
    </div>
  );
}
