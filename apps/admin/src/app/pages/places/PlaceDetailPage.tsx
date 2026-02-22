import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getPlace, patchPlace, deletePlace } from "@/lib/api/admin";
import type { AdminPlaceDetail } from "@/lib/api/types";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, Edit, Trash2 } from "lucide-react";

export function PlaceDetailPage() {
  const { placeCode } = useParams<{ placeCode: string }>();
  const navigate = useNavigate();
  const [place, setPlace] = useState<AdminPlaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!placeCode) return;
    void (async () => {
      setLoading(true);
      try {
        const p = await getPlace(placeCode);
        setPlace(p);
        setEditName(p.name);
        setEditDescription(p.description ?? "");
      } finally {
        setLoading(false);
      }
    })();
  }, [placeCode]);

  const handleSave = async () => {
    if (!placeCode || !place) return;
    setSaving(true);
    try {
      const updated = await patchPlace(placeCode, {
        name: editName,
        description: editDescription || undefined,
      });
      setPlace(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!placeCode) return;
    await deletePlace(placeCode);
    navigate("/places");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-text-secondary dark:text-dark-text-secondary">
        Loading...
      </div>
    );
  }
  if (!place) return <div className="text-red-500">Place not found.</div>;

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate("/places")}
        className="flex items-center gap-1.5 text-sm text-text-secondary dark:text-dark-text-secondary hover:text-text-main dark:hover:text-white"
      >
        <ArrowLeft size={16} /> Back to Places
      </button>

      <div className="rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          {editing ? (
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="text-xl font-semibold text-text-main dark:text-white bg-transparent border-b border-input-border dark:border-dark-border focus:outline-none w-full"
            />
          ) : (
            <h1 className="text-xl font-semibold text-text-main dark:text-white">{place.name}</h1>
          )}
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={() => setEditing(false)}
                  className="px-3 py-1.5 rounded-lg text-sm border border-input-border dark:border-dark-border text-text-secondary dark:text-dark-text-secondary hover:bg-background-light dark:hover:bg-dark-bg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-sm bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  Save
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="p-2 rounded-lg hover:bg-background-light dark:hover:bg-dark-bg text-text-secondary dark:text-dark-text-secondary transition-colors"
                >
                  <Edit size={16} />
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-text-secondary dark:text-dark-text-secondary">Religion</p>
            <p className="text-text-main dark:text-white capitalize">{place.religion}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary dark:text-dark-text-secondary">Type</p>
            <p className="text-text-main dark:text-white">{place.place_type}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary dark:text-dark-text-secondary">Reviews</p>
            <p className="text-text-main dark:text-white font-semibold">{place.review_count}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary dark:text-dark-text-secondary">Check-ins</p>
            <p className="text-text-main dark:text-white font-semibold">{place.check_in_count}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary dark:text-dark-text-secondary">Address</p>
            <p className="text-text-main dark:text-white">{place.address}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary dark:text-dark-text-secondary">Added</p>
            <p className="text-text-main dark:text-white">{formatDate(place.created_at)}</p>
          </div>
        </div>

        <div>
          <p className="text-xs text-text-secondary dark:text-dark-text-secondary mb-1">Description</p>
          {editing ? (
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-input-border dark:border-dark-border bg-transparent text-text-main dark:text-white text-sm p-2 focus:outline-none"
            />
          ) : (
            <p className="text-text-main dark:text-white text-sm">
              {place.description ?? "No description."}
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete place?"
        description={`Permanently delete "${place.name}" and all its data? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
