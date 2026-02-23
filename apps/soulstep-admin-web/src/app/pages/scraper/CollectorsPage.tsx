import { useEffect, useState } from "react";
import { listCollectors } from "@/lib/api/scraper";
import type { CollectorStatus } from "@/lib/api/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CheckCircle2, XCircle } from "lucide-react";

export function CollectorsPage() {
  const [collectors, setCollectors] = useState<CollectorStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listCollectors()
      .then(setCollectors)
      .catch(() => setCollectors([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-text-secondary dark:text-dark-text-secondary">
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-text-main dark:text-white">Collectors</h1>
      <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
        Data collectors fetch place information from external APIs. A collector is available when
        its required API key is configured.
      </p>

      {collectors.length === 0 ? (
        <p className="text-text-secondary dark:text-dark-text-secondary text-sm">
          No collectors found. Is the scraper service running?
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {collectors.map((c) => (
            <div
              key={c.name}
              className="rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-text-main dark:text-white capitalize">
                  {c.name.replace(/_/g, " ")}
                </h2>
                {c.is_available ? (
                  <CheckCircle2 size={18} className="text-green-500 shrink-0" />
                ) : (
                  <XCircle size={18} className="text-red-400 shrink-0" />
                )}
              </div>

              <div className="flex gap-2 flex-wrap">
                <StatusBadge
                  label={c.is_available ? "Available" : "Unavailable"}
                  variant={c.is_available ? "success" : "danger"}
                />
                {!c.requires_api_key && (
                  <StatusBadge label="No key required" variant="neutral" />
                )}
              </div>

              {c.requires_api_key && c.api_key_env_var && (
                <p className="text-xs text-text-secondary dark:text-dark-text-secondary font-mono">
                  {c.api_key_env_var}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
