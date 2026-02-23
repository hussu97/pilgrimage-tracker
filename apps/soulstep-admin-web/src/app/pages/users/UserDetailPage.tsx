import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getUser, patchUser, deactivateUser, listUserCheckIns, listUserReviews } from "@/lib/api/admin";
import type { AdminUserDetail, AdminUserCheckIn, AdminUserReview } from "@/lib/api/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatDate, formatDateTime } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

type Tab = "check-ins" | "reviews";

export function UserDetailPage() {
  const { userCode } = useParams<{ userCode: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("check-ins");
  const [checkIns, setCheckIns] = useState<AdminUserCheckIn[]>([]);
  const [reviews, setReviews] = useState<AdminUserReview[]>([]);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  useEffect(() => {
    if (!userCode) return;
    void (async () => {
      setLoading(true);
      try {
        const u = await getUser(userCode);
        setUser(u);
        const [ci, rv] = await Promise.all([
          listUserCheckIns(userCode, { page_size: 50 }),
          listUserReviews(userCode, { page_size: 50 }),
        ]);
        setCheckIns(ci.items);
        setReviews(rv.items);
      } finally {
        setLoading(false);
      }
    })();
  }, [userCode]);

  const handleToggleActive = async () => {
    if (!user || !userCode) return;
    if (user.is_active) {
      setConfirmDeactivate(true);
    } else {
      const updated = await patchUser(userCode, { is_active: true });
      setUser(updated);
    }
  };

  const handleDeactivateConfirm = async () => {
    if (!userCode) return;
    await deactivateUser(userCode);
    setUser((u) => u ? { ...u, is_active: false } : u);
    setConfirmDeactivate(false);
  };

  const handleToggleAdmin = async () => {
    if (!user || !userCode) return;
    const updated = await patchUser(userCode, { is_admin: !user.is_admin });
    setUser(updated);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-text-secondary dark:text-dark-text-secondary">
        Loading...
      </div>
    );
  }
  if (!user) {
    return <div className="text-red-500">User not found.</div>;
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate("/users")}
        className="flex items-center gap-1.5 text-sm text-text-secondary dark:text-dark-text-secondary hover:text-text-main dark:hover:text-white"
      >
        <ArrowLeft size={16} /> Back to Users
      </button>

      {/* Profile Card */}
      <div className="rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-text-main dark:text-white">
              {user.display_name}
            </h1>
            <p className="text-sm text-text-secondary dark:text-dark-text-secondary">{user.email}</p>
            <p className="text-xs font-mono text-text-secondary dark:text-dark-text-secondary mt-1">
              {user.user_code}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge
              label={user.is_active ? "Active" : "Inactive"}
              variant={user.is_active ? "success" : "danger"}
            />
            {user.is_admin && <StatusBadge label="Admin" variant="info" />}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-text-secondary dark:text-dark-text-secondary text-xs">Joined</p>
            <p className="text-text-main dark:text-white">{formatDate(user.created_at)}</p>
          </div>
          <div>
            <p className="text-text-secondary dark:text-dark-text-secondary text-xs">Check-ins</p>
            <p className="text-text-main dark:text-white font-semibold">{user.check_in_count}</p>
          </div>
          <div>
            <p className="text-text-secondary dark:text-dark-text-secondary text-xs">Reviews</p>
            <p className="text-text-main dark:text-white font-semibold">{user.review_count}</p>
          </div>
        </div>

        <div className="flex gap-3 pt-2 border-t border-input-border dark:border-dark-border">
          <button
            onClick={handleToggleActive}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-input-border dark:border-dark-border text-text-main dark:text-white hover:bg-background-light dark:hover:bg-dark-bg transition-colors"
          >
            {user.is_active ? "Deactivate" : "Activate"}
          </button>
          <button
            onClick={handleToggleAdmin}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-input-border dark:border-dark-border text-text-main dark:text-white hover:bg-background-light dark:hover:bg-dark-bg transition-colors"
          >
            {user.is_admin ? "Demote from Admin" : "Promote to Admin"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-input-border dark:border-dark-border flex gap-6">
        {(["check-ins", "reviews"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-3 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "text-primary border-b-2 border-primary"
                : "text-text-secondary dark:text-dark-text-secondary hover:text-text-main dark:hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "check-ins" && (
        <div className="space-y-2">
          {checkIns.length === 0 && (
            <p className="text-text-secondary dark:text-dark-text-secondary text-sm">No check-ins.</p>
          )}
          {checkIns.map((ci) => (
            <div
              key={ci.check_in_code}
              className="rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface px-4 py-3 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-text-main dark:text-white">
                  {ci.place_name ?? ci.place_code}
                </span>
                <span className="text-text-secondary dark:text-dark-text-secondary">
                  {formatDateTime(ci.checked_in_at)}
                </span>
              </div>
              {ci.note && (
                <p className="text-text-secondary dark:text-dark-text-secondary mt-1">{ci.note}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "reviews" && (
        <div className="space-y-2">
          {reviews.length === 0 && (
            <p className="text-text-secondary dark:text-dark-text-secondary text-sm">No reviews.</p>
          )}
          {reviews.map((r) => (
            <div
              key={r.review_code}
              className="rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface px-4 py-3 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-text-main dark:text-white">
                  {r.place_name ?? r.place_code} — {r.rating}/5
                </span>
                <div className="flex items-center gap-2">
                  {r.is_flagged && <StatusBadge label="Flagged" variant="danger" />}
                  <span className="text-text-secondary dark:text-dark-text-secondary">
                    {formatDate(r.created_at)}
                  </span>
                </div>
              </div>
              {r.title && (
                <p className="text-text-main dark:text-white mt-1 font-medium">{r.title}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmDeactivate}
        onOpenChange={setConfirmDeactivate}
        title="Deactivate user?"
        description={`This will deactivate ${user.display_name}. They will not be able to log in.`}
        confirmLabel="Deactivate"
        destructive
        onConfirm={handleDeactivateConfirm}
      />
    </div>
  );
}
