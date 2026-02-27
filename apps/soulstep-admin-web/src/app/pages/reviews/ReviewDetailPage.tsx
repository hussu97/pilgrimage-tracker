import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getReview, patchReview, deleteReview } from "@/lib/api/admin";
import type { AdminReviewDetail } from "@/lib/api/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatDateTime } from "@/lib/utils";
import { ArrowLeft, Trash2 } from "lucide-react";

export function ReviewDetailPage() {
  const { reviewCode } = useParams<{ reviewCode: string }>();
  const navigate = useNavigate();
  const [review, setReview] = useState<AdminReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!reviewCode) return;
    void (async () => {
      setLoading(true);
      try {
        const r = await getReview(reviewCode);
        setReview(r);
      } finally {
        setLoading(false);
      }
    })();
  }, [reviewCode]);

  const handleToggleFlag = async () => {
    if (!review || !reviewCode) return;
    const updated = await patchReview(reviewCode, { is_flagged: !review.is_flagged });
    setReview(updated);
  };

  const handleDelete = async () => {
    if (!reviewCode) return;
    await deleteReview(reviewCode);
    navigate("/reviews");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-text-secondary dark:text-dark-text-secondary">
        Loading...
      </div>
    );
  }
  if (!review) return <div className="text-red-500">Review not found.</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <button
        onClick={() => navigate("/reviews")}
        className="flex items-center gap-1.5 text-sm text-text-secondary dark:text-dark-text-secondary hover:text-text-main dark:hover:text-white"
      >
        <ArrowLeft size={16} /> Back to Reviews
      </button>

      <div className="rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
              {review.place_name ?? review.place_code} — {review.rating}/5
            </p>
            <p className="text-xs text-text-secondary dark:text-dark-text-secondary">
              by {review.user_display_name ?? review.author_name ?? "Anonymous"} ·{" "}
              {review.review_time
                ? formatDateTime(new Date(review.review_time * 1000).toISOString())
                : formatDateTime(review.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {review.is_flagged && <StatusBadge label="Flagged" variant="danger" />}
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {review.title && (
          <h2 className="font-semibold text-text-main dark:text-white">{review.title}</h2>
        )}
        {review.body && (
          <p className="text-text-main dark:text-white text-sm whitespace-pre-wrap">{review.body}</p>
        )}

        <div className="pt-3 border-t border-input-border dark:border-dark-border">
          <button
            onClick={handleToggleFlag}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-input-border dark:border-dark-border text-text-main dark:text-white hover:bg-background-light dark:hover:bg-dark-bg transition-colors"
          >
            {review.is_flagged ? "Unflag Review" : "Flag Review"}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete review?"
        description="Permanently delete this review? This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
