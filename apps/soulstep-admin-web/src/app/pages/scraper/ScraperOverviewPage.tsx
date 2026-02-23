import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getScraperStats } from "@/lib/api/scraper";
import type { ScraperStats } from "@/lib/api/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate } from "@/lib/utils";
import { Database, MapPin, Play, Layers } from "lucide-react";

const SCRAPER_SECTIONS = [
  { label: "Data Locations", to: "/scraper/data-locations", description: "Manage geographic locations to scrape." },
  { label: "Runs", to: "/scraper/runs", description: "Start, monitor, and manage scraper runs." },
  { label: "Collectors", to: "/scraper/collectors", description: "View configured data collectors and their status." },
  { label: "Place Type Mappings", to: "/scraper/place-type-mappings", description: "Map external place types to internal types." },
];

function runStatusVariant(status: string | null) {
  if (!status) return "neutral" as const;
  if (status === "completed") return "success" as const;
  if (status === "failed") return "danger" as const;
  if (status === "running") return "info" as const;
  if (status === "cancelled") return "warning" as const;
  return "neutral" as const;
}

export function ScraperOverviewPage() {
  const [stats, setStats] = useState<ScraperStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        setStats(await getScraperStats());
      } catch {
        // scraper service may be offline
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-text-main dark:text-white">Data Scraper</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Locations", value: loading ? "—" : String(stats?.total_locations ?? 0), icon: <MapPin size={18} /> },
          { label: "Total Runs", value: loading ? "—" : String(stats?.total_runs ?? 0), icon: <Play size={18} /> },
          { label: "Places Scraped", value: loading ? "—" : String(stats?.total_places_scraped ?? 0), icon: <Database size={18} /> },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-5 space-y-1"
          >
            <div className="flex items-center gap-2 text-text-secondary dark:text-dark-text-secondary">
              {card.icon}
              <p className="text-xs font-medium uppercase tracking-wide">{card.label}</p>
            </div>
            <p className="text-2xl font-semibold text-text-main dark:text-white">{card.value}</p>
          </div>
        ))}
        <div className="rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-5 space-y-1">
          <div className="flex items-center gap-2 text-text-secondary dark:text-dark-text-secondary">
            <Layers size={18} />
            <p className="text-xs font-medium uppercase tracking-wide">Last Run</p>
          </div>
          {loading ? (
            <p className="text-2xl font-semibold text-text-main dark:text-white">—</p>
          ) : stats?.last_run_at ? (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-text-main dark:text-white">
                {formatDate(stats.last_run_at)}
              </p>
              {stats.last_run_status && (
                <StatusBadge
                  label={stats.last_run_status}
                  variant={runStatusVariant(stats.last_run_status)}
                />
              )}
            </div>
          ) : (
            <p className="text-2xl font-semibold text-text-main dark:text-white">Never</p>
          )}
        </div>
      </div>

      {/* Section cards */}
      <div>
        <h2 className="text-base font-semibold text-text-main dark:text-white mb-3">Sections</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SCRAPER_SECTIONS.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="block rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-5 hover:border-primary dark:hover:border-primary transition-colors"
            >
              <p className="font-semibold text-text-main dark:text-white">{s.label}</p>
              <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-1">
                {s.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
