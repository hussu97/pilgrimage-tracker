import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getScraperStats, retryFailedImages } from "@/lib/api/scraper";
import type { ScraperStats } from "@/lib/api/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate } from "@/lib/utils";
import { statusVariant as runStatusVariant } from "@/lib/utils/scraperStatus";
import { Database, MapPin, Play, Layers, ImageOff, Loader2 } from "lucide-react";

const SCRAPER_SECTIONS = [
  { label: "Data Locations", to: "/scraper/data-locations", description: "Manage geographic locations to scrape." },
  { label: "Runs", to: "/scraper/runs", description: "Start, monitor, and manage scraper runs." },
  { label: "Collectors", to: "/scraper/collectors", description: "View configured data collectors and their status." },
  { label: "Place Type Mappings", to: "/scraper/place-type-mappings", description: "Map external place types to internal types." },
  { label: "Quality Metrics", to: "/quality", description: "Evaluate quality scoring thresholds and filter rates." },
];

export function ScraperOverviewPage() {
  const [stats, setStats] = useState<ScraperStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<{ ok: boolean; message: string } | null>(null);

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

  async function handleRetryImages() {
    setRetrying(true);
    setRetryResult(null);
    try {
      const result = await retryFailedImages();
      setRetryResult({ ok: true, message: result.message });
    } catch {
      setRetryResult({ ok: false, message: "Failed to reach scraper service." });
    } finally {
      setRetrying(false);
    }
  }

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

      {/* Maintenance */}
      <div>
        <h2 className="text-base font-semibold text-text-main dark:text-white mb-3">Maintenance</h2>
        <div className="rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-5 space-y-3">
          <div className="flex items-start gap-3">
            <ImageOff size={18} className="mt-0.5 shrink-0 text-text-secondary dark:text-dark-text-secondary" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-text-main dark:text-white text-sm">Retry Failed Images</p>
              <p className="text-xs text-text-secondary dark:text-dark-text-secondary mt-0.5">
                Re-attempts image downloads for all scraped places where images failed to download
                during the original run. Falls back to re-fetching fresh photo URLs from Google if
                the stored URLs have expired.
              </p>
              {retryResult && (
                <p
                  className={`text-xs mt-2 font-medium ${
                    retryResult.ok
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {retryResult.message}
                </p>
              )}
            </div>
            <button
              onClick={() => void handleRetryImages()}
              disabled={retrying}
              className="shrink-0 flex items-center gap-1.5 rounded-lg border border-input-border dark:border-dark-border px-3 py-1.5 text-xs font-medium text-text-main dark:text-white hover:border-primary dark:hover:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {retrying ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Starting…
                </>
              ) : (
                "Run cleanup"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
