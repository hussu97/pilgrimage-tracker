import { useEffect, useState, useCallback } from "react";
import {
  broadcastNotification,
  sendNotification,
  listNotificationHistory,
} from "@/lib/api/admin";
import type { AdminBroadcastItem, AdminBroadcastListResponse } from "@/lib/api/types";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Pagination } from "@/components/shared/Pagination";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatDateTime } from "@/lib/utils";
import { Send } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type RecipientMode = "all" | "specific";

interface SendForm {
  recipientMode: RecipientMode;
  userCodesRaw: string;
  type: string;
  payloadRaw: string;
}

const DEFAULT_FORM: SendForm = {
  recipientMode: "all",
  userCodesRaw: "",
  type: "",
  payloadRaw: "{}",
};

// ── Form field helpers ────────────────────────────────────────────────────────

interface FieldLabelProps {
  children: React.ReactNode;
  required?: boolean;
}

function FieldLabel({ children, required }: FieldLabelProps) {
  return (
    <label className="block text-xs font-semibold text-text-secondary dark:text-dark-text-secondary mb-1 uppercase tracking-wide">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

// ── Success / Error banner ────────────────────────────────────────────────────

interface BannerProps {
  type: "success" | "error";
  message: string;
  onDismiss: () => void;
}

function Banner({ type, message, onDismiss }: BannerProps) {
  return (
    <div
      className={
        type === "success"
          ? "flex items-start gap-3 rounded-lg border border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-900/20 px-4 py-3"
          : "flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 px-4 py-3"
      }
    >
      <p
        className={
          type === "success"
            ? "flex-1 text-sm text-green-800 dark:text-green-400"
            : "flex-1 text-sm text-red-800 dark:text-red-400"
        }
      >
        {message}
      </p>
      <button
        onClick={onDismiss}
        className={
          type === "success"
            ? "text-green-600 dark:text-green-400 hover:opacity-70 text-lg leading-none"
            : "text-red-600 dark:text-red-400 hover:opacity-70 text-lg leading-none"
        }
        aria-label="Dismiss"
      >
        &times;
      </button>
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────────────

export function NotificationManagementPage() {
  // ── Send form state ──
  const [form, setForm] = useState<SendForm>(DEFAULT_FORM);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── History table state ──
  const { page, pageSize, setPage, setPageSize } = usePagination(50);
  const [history, setHistory] = useState<AdminBroadcastListResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);

  // ── Load history ──
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await listNotificationHistory({ page, page_size: pageSize });
      setHistory(res);
    } catch {
      setHistory({ items: [], total: 0, page: 1, page_size: pageSize });
    } finally {
      setHistoryLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // ── Form helpers ──
  const updateField = <K extends keyof SendForm>(key: K, value: SendForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFormError(null);
    setSuccessMsg(null);
  };

  const parsePayload = (): Record<string, unknown> | null => {
    const raw = form.payloadRaw.trim();
    if (!raw || raw === "{}") return {};
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const handleSend = async () => {
    setFormError(null);
    setSuccessMsg(null);

    // Validate type
    if (!form.type.trim()) {
      setFormError("Notification type is required.");
      return;
    }

    // Validate payload JSON
    const payload = parsePayload();
    if (payload === null) {
      setFormError("Payload must be a valid JSON object (e.g. {\"key\": \"value\"}).");
      return;
    }

    setSending(true);
    try {
      if (form.recipientMode === "all") {
        const result = await broadcastNotification({
          type: form.type.trim(),
          payload,
        });
        setSuccessMsg(
          `Broadcast sent to ${result.recipient_count.toLocaleString()} user${result.recipient_count !== 1 ? "s" : ""}. Code: ${result.broadcast_code}`
        );
      } else {
        const userCodes = form.userCodesRaw
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        if (userCodes.length === 0) {
          setFormError("Enter at least one user code.");
          setSending(false);
          return;
        }
        const result = await sendNotification({
          user_codes: userCodes,
          type: form.type.trim(),
          payload,
        });
        setSuccessMsg(
          `Notification sent to ${result.recipient_count.toLocaleString()} user${result.recipient_count !== 1 ? "s" : ""}. Code: ${result.broadcast_code}`
        );
      }
      // Reset form
      setForm(DEFAULT_FORM);
      // Refresh history
      void loadHistory();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to send notification. Check the console for details.";
      setFormError(message);
    } finally {
      setSending(false);
    }
  };

  // ── History table columns ──
  const columns: Column<AdminBroadcastItem>[] = [
    {
      key: "broadcast_code",
      header: "Broadcast Code",
      render: (item) => (
        <span className="font-mono text-xs text-text-secondary dark:text-dark-text-secondary">
          {item.broadcast_code}
        </span>
      ),
    },
    {
      key: "admin",
      header: "Admin",
      render: (item) => (
        <span className="text-text-main dark:text-white">
          {item.admin_display_name ?? (
            <span className="font-mono text-xs text-text-secondary dark:text-dark-text-secondary">
              {item.admin_user_code}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (item) => (
        <span className="font-medium text-text-main dark:text-white">{item.type}</span>
      ),
    },
    {
      key: "recipients",
      header: "Recipients",
      render: (item) => (
        <div className="flex items-center gap-2">
          <StatusBadge
            label={item.recipient_type === "all" ? "Broadcast" : "Targeted"}
            variant={item.recipient_type === "all" ? "info" : "neutral"}
          />
          <span className="text-xs text-text-secondary dark:text-dark-text-secondary">
            {item.recipient_count.toLocaleString()}
          </span>
        </div>
      ),
    },
    {
      key: "created_at",
      header: "Sent At",
      render: (item) => (
        <span className="text-text-secondary dark:text-dark-text-secondary whitespace-nowrap">
          {formatDateTime(item.created_at)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Page heading */}
      <div>
        <h1 className="text-xl font-semibold text-text-main dark:text-white">Notifications</h1>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-0.5">
          Send push notifications to all users or specific users, and view broadcast history.
        </p>
      </div>

      {/* ── Section 1: Send Notification ── */}
      <div className="rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-6 space-y-5">
        <h2 className="text-base font-semibold text-text-main dark:text-white">
          Send Notification
        </h2>

        {/* Banners */}
        {successMsg && (
          <Banner
            type="success"
            message={successMsg}
            onDismiss={() => setSuccessMsg(null)}
          />
        )}
        {formError && (
          <Banner
            type="error"
            message={formError}
            onDismiss={() => setFormError(null)}
          />
        )}

        <div className="space-y-4">
          {/* Recipient radio */}
          <div>
            <FieldLabel required>Recipient</FieldLabel>
            <div className="flex gap-5">
              {(
                [
                  { value: "all", label: "All active users" },
                  { value: "specific", label: "Specific users" },
                ] as { value: RecipientMode; label: string }[]
              ).map(({ value, label }) => (
                <label
                  key={value}
                  className="flex items-center gap-2 cursor-pointer text-sm text-text-main dark:text-white"
                >
                  <input
                    type="radio"
                    name="recipientMode"
                    value={value}
                    checked={form.recipientMode === value}
                    onChange={() => updateField("recipientMode", value)}
                    className="accent-primary h-4 w-4"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* User codes textarea — only shown for specific mode */}
          {form.recipientMode === "specific" && (
            <div>
              <FieldLabel required>User Codes</FieldLabel>
              <textarea
                value={form.userCodesRaw}
                onChange={(e) => updateField("userCodesRaw", e.target.value)}
                placeholder={"usr_abc123\nusr_def456"}
                rows={4}
                className="w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg text-text-main dark:text-white text-sm px-3 py-2 font-mono outline-none focus:border-primary resize-none placeholder:text-text-secondary dark:placeholder:text-dark-text-secondary"
              />
              <p className="mt-1 text-xs text-text-secondary dark:text-dark-text-secondary">
                One user code per line.
              </p>
            </div>
          )}

          {/* Type input */}
          <div>
            <FieldLabel required>Type</FieldLabel>
            <input
              type="text"
              value={form.type}
              onChange={(e) => updateField("type", e.target.value)}
              placeholder="announcement"
              className="w-full max-w-sm rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg text-text-main dark:text-white text-sm px-3 py-2 outline-none focus:border-primary placeholder:text-text-secondary dark:placeholder:text-dark-text-secondary"
            />
            <p className="mt-1 text-xs text-text-secondary dark:text-dark-text-secondary">
              The notification event type (e.g. <code className="font-mono">announcement</code>, <code className="font-mono">alert</code>).
            </p>
          </div>

          {/* Payload JSON textarea */}
          <div>
            <FieldLabel>Payload (JSON)</FieldLabel>
            <textarea
              value={form.payloadRaw}
              onChange={(e) => updateField("payloadRaw", e.target.value)}
              rows={5}
              spellCheck={false}
              className="w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg text-text-main dark:text-white text-sm px-3 py-2 font-mono outline-none focus:border-primary resize-y placeholder:text-text-secondary dark:placeholder:text-dark-text-secondary"
            />
            <p className="mt-1 text-xs text-text-secondary dark:text-dark-text-secondary">
              Optional JSON object with extra data. Defaults to <code className="font-mono">{"{}"}</code>.
            </p>
          </div>

          {/* Send button */}
          <div>
            <button
              onClick={() => void handleSend()}
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Send size={15} />
              {sending ? "Sending…" : "Send Notification"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Section 2: Broadcast History ── */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-text-main dark:text-white">
          Broadcast History
        </h2>

        <DataTable
          columns={columns}
          data={history?.items ?? []}
          loading={historyLoading}
          rowKey={(item) => item.broadcast_code}
          emptyMessage="No notifications sent yet."
        />

        <Pagination
          page={page}
          pageSize={pageSize}
          total={history?.total ?? 0}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}
