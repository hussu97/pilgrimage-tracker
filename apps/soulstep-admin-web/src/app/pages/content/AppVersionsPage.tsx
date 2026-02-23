import { useEffect, useState } from "react";
import { listAppVersions, updateAppVersion } from "@/lib/api/admin";
import type { AppVersionConfig } from "@/lib/api/types";
import { Pencil, Check, X, Smartphone, Tablet } from "lucide-react";

const PLATFORMS = ["ios", "android"] as const;
type Platform = (typeof PLATFORMS)[number];

const PLATFORM_LABELS: Record<Platform, string> = {
  ios: "iOS",
  android: "Android",
};

interface PlatformConfig extends AppVersionConfig {
  platform: Platform;
}

interface EditForm {
  min_version_hard: string;
  min_version_soft: string;
  latest_version: string;
  store_url: string;
}

function emptyForm(config?: AppVersionConfig): EditForm {
  return {
    min_version_hard: config?.min_version_hard ?? "",
    min_version_soft: config?.min_version_soft ?? "",
    latest_version: config?.latest_version ?? "",
    store_url: config?.store_url ?? "",
  };
}

export function AppVersionsPage() {
  const [configs, setConfigs] = useState<Partial<Record<Platform, PlatformConfig>>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Platform | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    listAppVersions()
      .then((rows) => {
        const map: Partial<Record<Platform, PlatformConfig>> = {};
        for (const row of rows) {
          if (row.platform === "ios" || row.platform === "android") {
            map[row.platform as Platform] = row as PlatformConfig;
          }
        }
        setConfigs(map);
      })
      .catch(() => setConfigs({}))
      .finally(() => setLoading(false));
  }, []);

  const startEdit = (platform: Platform) => {
    setEditForm(emptyForm(configs[platform]));
    setEditing(platform);
  };

  const cancelEdit = () => setEditing(null);

  const saveEdit = async (platform: Platform) => {
    setSaving(true);
    try {
      const updated = await updateAppVersion(platform, editForm);
      setConfigs((c) => ({ ...c, [platform]: updated as PlatformConfig }));
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-text-secondary dark:text-dark-text-secondary text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text-main dark:text-white">App Version Config</h1>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-0.5">
          Set version requirements for iOS and Android. Mobile apps check these on startup.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {PLATFORMS.map((platform) => {
          const config = configs[platform];
          const isEditing = editing === platform;
          const PlatformIcon = platform === "ios" ? Tablet : Smartphone;

          return (
            <div
              key={platform}
              className="rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-6 space-y-5"
            >
              {/* Card header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <PlatformIcon size={18} className="text-primary" />
                  </div>
                  <h2 className="text-base font-semibold text-text-main dark:text-white">
                    {PLATFORM_LABELS[platform]}
                  </h2>
                </div>
                {!isEditing ? (
                  <button
                    onClick={() => startEdit(platform)}
                    className="flex items-center gap-1.5 rounded-lg border border-input-border dark:border-dark-border px-3 py-1.5 text-xs font-medium text-text-secondary dark:text-dark-text-secondary hover:bg-background-light dark:hover:bg-dark-bg transition-colors"
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      disabled={saving}
                      onClick={() => void saveEdit(platform)}
                      className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      <Check size={12} />
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="flex items-center gap-1.5 rounded-lg border border-input-border dark:border-dark-border px-3 py-1.5 text-xs font-medium text-text-secondary dark:text-dark-text-secondary hover:bg-background-light dark:hover:bg-dark-bg transition-colors"
                    >
                      <X size={12} />
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Fields */}
              <div className="space-y-3">
                {(
                  [
                    { key: "latest_version", label: "Latest Version" },
                    { key: "min_version_soft", label: "Min Version (soft)" },
                    { key: "min_version_hard", label: "Min Version (hard)" },
                    { key: "store_url", label: "Store URL" },
                  ] as const
                ).map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-44 shrink-0 text-xs text-text-secondary dark:text-dark-text-secondary">
                      {label}
                    </span>
                    {isEditing ? (
                      <input
                        value={editForm[key]}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, [key]: e.target.value }))
                        }
                        className="flex-1 rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-1.5 text-sm text-text-main dark:text-white outline-none focus:border-primary"
                      />
                    ) : (
                      <span className="flex-1 text-sm font-mono text-text-main dark:text-white">
                        {config?.[key] || (
                          <span className="text-text-secondary dark:text-dark-text-secondary italic">
                            not set
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {config?.updated_at && (
                <p className="text-xs text-text-secondary dark:text-dark-text-secondary border-t border-input-border dark:border-dark-border pt-3">
                  Last updated: {new Date(config.updated_at).toLocaleString()}
                </p>
              )}

              {!config && !isEditing && (
                <p className="text-xs text-amber-500 dark:text-amber-400">
                  No config in DB — click Edit to create one.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
