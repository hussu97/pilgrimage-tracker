import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getGroup, deleteGroup, listGroupMembers, removeGroupMember } from "@/lib/api/admin";
import type { AdminGroupDetail, AdminGroupMember } from "@/lib/api/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, Trash2, UserMinus } from "lucide-react";

export function GroupDetailPage() {
  const { groupCode } = useParams<{ groupCode: string }>();
  const navigate = useNavigate();
  const [group, setGroup] = useState<AdminGroupDetail | null>(null);
  const [members, setMembers] = useState<AdminGroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removeMemberTarget, setRemoveMemberTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!groupCode) return;
    void (async () => {
      setLoading(true);
      try {
        const [g, m] = await Promise.all([
          getGroup(groupCode),
          listGroupMembers(groupCode),
        ]);
        setGroup(g);
        setMembers(m.items);
      } finally {
        setLoading(false);
      }
    })();
  }, [groupCode]);

  const handleDelete = async () => {
    if (!groupCode) return;
    await deleteGroup(groupCode);
    navigate("/groups");
  };

  const handleRemoveMember = async () => {
    if (!groupCode || !removeMemberTarget) return;
    await removeGroupMember(groupCode, removeMemberTarget);
    setMembers((ms) => ms.filter((m) => m.user_code !== removeMemberTarget));
    setRemoveMemberTarget(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-text-secondary dark:text-dark-text-secondary">
        Loading...
      </div>
    );
  }
  if (!group) return <div className="text-red-500">Group not found.</div>;

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate("/groups")}
        className="flex items-center gap-1.5 text-sm text-text-secondary dark:text-dark-text-secondary hover:text-text-main dark:hover:text-white"
      >
        <ArrowLeft size={16} /> Back to Groups
      </button>

      <div className="rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-text-main dark:text-white">{group.name}</h1>
            <p className="text-xs font-mono text-text-secondary dark:text-dark-text-secondary mt-1">
              {group.group_code}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge
              label={group.is_private ? "Private" : "Public"}
              variant={group.is_private ? "warning" : "success"}
            />
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {group.description && (
          <p className="text-text-secondary dark:text-dark-text-secondary text-sm">{group.description}</p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-text-secondary dark:text-dark-text-secondary">Members</p>
            <p className="font-semibold text-text-main dark:text-white">{group.member_count}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary dark:text-dark-text-secondary">Places</p>
            <p className="font-semibold text-text-main dark:text-white">{group.place_count}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary dark:text-dark-text-secondary">Created</p>
            <p className="text-text-main dark:text-white">{formatDate(group.created_at)}</p>
          </div>
        </div>
      </div>

      {/* Members */}
      <div>
        <h2 className="text-base font-semibold text-text-main dark:text-white mb-3">Members</h2>
        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.user_code}
              className="flex items-center justify-between rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-text-main dark:text-white">{m.display_name}</p>
                <p className="text-xs text-text-secondary dark:text-dark-text-secondary">{m.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge
                  label={m.role}
                  variant={m.role === "admin" ? "info" : "neutral"}
                />
                <button
                  onClick={() => setRemoveMemberTarget(m.user_code)}
                  className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
                >
                  <UserMinus size={14} />
                </button>
              </div>
            </div>
          ))}
          {members.length === 0 && (
            <p className="text-text-secondary dark:text-dark-text-secondary text-sm">No members.</p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete group?"
        description={`Permanently delete "${group.name}" and all its data?`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
      <ConfirmDialog
        open={!!removeMemberTarget}
        onOpenChange={(o) => !o && setRemoveMemberTarget(null)}
        title="Remove member?"
        description="Remove this member from the group?"
        confirmLabel="Remove"
        destructive
        onConfirm={handleRemoveMember}
      />
    </div>
  );
}
