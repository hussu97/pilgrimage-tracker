import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, useFeedback, useI18n } from '@/app/providers';
import { cn } from '@/lib/utils/cn';
import {
  getGroup,
  getGroupLeaderboard,
  getGroupActivity,
  getGroupChecklist,
  getGroupMembers,
  leaveGroup,
  deleteGroup,
  removeGroupMember,
  updateMemberRole,
  addPlaceNote,
  deletePlaceNote,
} from '@/lib/api/client';
import { shareUrl } from '@/lib/share';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import ErrorState from '@/components/common/ErrorState';
import GroupCheckInModal from '@/components/groups/GroupCheckInModal';
import type { Group, LeaderboardEntry, ActivityItem, GroupMember } from '@/lib/types';
import type { ChecklistResponse, PlaceNote } from '@/lib/types/groups';
import AdBanner from '@/components/ads/AdBanner';

type Tab = 'route' | 'activity' | 'members';

/** Circular SVG progress ring (white-on-transparent for hero overlay) */
function ProgressRing({
  pct,
  size = 64,
  stroke = 5,
}: {
  pct: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className="rotate-[-90deg]"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="rgba(255,255,255,0.25)"
        strokeWidth={stroke}
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="white"
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  );
}

export default function GroupDetail() {
  const { groupCode } = useParams<{ groupCode: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user } = useAuth();
  const { showSuccess, showError } = useFeedback();

  const [group, setGroup] = useState<Group | null>(null);
  const [tab, setTab] = useState<Tab>('route');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [checklist, setChecklist] = useState<ChecklistResponse | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Itinerary state
  const [expandedPlace, setExpandedPlace] = useState<string | null>(null);
  const [checkInModal, setCheckInModal] = useState<{ placeCode: string; placeName: string } | null>(
    null,
  );
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [noteSubmitting, setNoteSubmitting] = useState<Record<string, boolean>>({});

  // Invite state
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);

  // Member management state
  const [confirmAction, setConfirmAction] = useState<{
    type: 'leave' | 'delete' | 'remove' | 'promote' | 'demote';
    userCode?: string;
    displayName?: string;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!groupCode) return;
    setLoading(true);
    setError('');
    try {
      const [g, lb, act, chk, mem] = await Promise.all([
        getGroup(groupCode),
        getGroupLeaderboard(groupCode),
        getGroupActivity(groupCode, 20),
        getGroupChecklist(groupCode),
        getGroupMembers(groupCode),
      ]);
      setGroup(g);
      setLeaderboard(Array.isArray(lb) ? lb : []);
      setActivity(Array.isArray(act) ? act : []);
      setChecklist(chk);
      setMembers(Array.isArray(mem) ? mem : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setGroup(null);
    } finally {
      setLoading(false);
    }
  }, [groupCode, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const inviteUrl = group?.invite_code
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/join?code=${group.invite_code}`
    : '';

  const isAdmin = members.some((m) => m.user_code === user?.user_code && m.role === 'admin');
  const isCreator = group?.created_by_user_code === user?.user_code;

  const handleLeave = async () => {
    if (!groupCode) return;
    setActionLoading(true);
    try {
      await leaveGroup(groupCode);
      showSuccess(t('feedback.groupLeft'));
      setTimeout(() => navigate('/groups'), 400);
    } catch {
      showError(t('feedback.error'));
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const handleDelete = async () => {
    if (!groupCode) return;
    setActionLoading(true);
    try {
      await deleteGroup(groupCode);
      showSuccess(t('feedback.groupDeleted'));
      setTimeout(() => navigate('/groups'), 400);
    } catch {
      showError(t('feedback.error'));
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const handleRemoveMember = async (userCode: string) => {
    if (!groupCode) return;
    setActionLoading(true);
    try {
      await removeGroupMember(groupCode, userCode);
      setMembers((prev) => prev.filter((m) => m.user_code !== userCode));
      showSuccess(t('feedback.memberRemoved'));
    } catch {
      showError(t('feedback.error'));
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const handleRoleChange = async (userCode: string, newRole: 'admin' | 'member') => {
    if (!groupCode) return;
    setActionLoading(true);
    try {
      await updateMemberRole(groupCode, userCode, newRole);
      setMembers((prev) =>
        prev.map((m) => (m.user_code === userCode ? { ...m, role: newRole } : m)),
      );
      showSuccess(t('feedback.roleUpdated'));
    } catch {
      showError(t('feedback.error'));
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const handleAddNote = async (placeCode: string) => {
    if (!groupCode) return;
    const text = noteInputs[placeCode]?.trim();
    if (!text) return;
    setNoteSubmitting((prev) => ({ ...prev, [placeCode]: true }));
    try {
      const note = await addPlaceNote(groupCode, placeCode, text);
      setNoteInputs((prev) => ({ ...prev, [placeCode]: '' }));
      if (checklist) {
        setChecklist({
          ...checklist,
          places: checklist.places.map((p) =>
            p.place_code === placeCode
              ? { ...p, notes: [...p.notes, note as unknown as PlaceNote] }
              : p,
          ),
        });
      }
      showSuccess(t('feedback.noteSaved'));
    } catch {
      showError(t('feedback.error'));
    } finally {
      setNoteSubmitting((prev) => ({ ...prev, [placeCode]: false }));
    }
  };

  const handleDeleteNote = async (placeCode: string, noteCode: string) => {
    if (!groupCode) return;
    try {
      await deletePlaceNote(groupCode, noteCode);
      if (checklist) {
        setChecklist({
          ...checklist,
          places: checklist.places.map((p) =>
            p.place_code === placeCode
              ? { ...p, notes: p.notes.filter((n) => n.note_code !== noteCode) }
              : p,
          ),
        });
      }
      showSuccess(t('feedback.noteDeleted'));
    } catch {
      showError(t('feedback.error'));
    }
  };

  if (!groupCode) {
    return (
      <div className="p-6 text-center dark:bg-dark-bg min-h-screen">
        <p className="text-text-muted dark:text-dark-text-secondary">{t('groups.missingGroup')}</p>
        <button type="button" onClick={() => navigate('/groups')} className="text-primary mt-2">
          {t('groups.title')}
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 flex justify-center">
        <span className="material-symbols-outlined animate-spin text-primary text-3xl">
          progress_activity
        </span>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="max-w-md md:max-w-2xl mx-auto px-4 py-8">
        <ErrorState
          message={error ?? t('groups.notFound')}
          onRetry={fetchData}
          retryLabel={t('common.retry')}
          action={
            <button
              type="button"
              onClick={() => navigate('/groups')}
              className="px-4 py-2 rounded-xl border border-input-border text-text-main font-medium hover:bg-soft-blue"
            >
              {t('nav.groups')}
            </button>
          }
        />
      </div>
    );
  }

  const pct =
    (group.total_sites ?? 0) > 0
      ? Math.round(((group.sites_visited ?? 0) / (group.total_sites ?? 1)) * 100)
      : checklist && checklist.total_places > 0
        ? checklist.group_progress
        : 0;

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'route', label: t('groups.itinerary'), icon: 'route' },
    { key: 'activity', label: t('groups.activity'), icon: 'history' },
    { key: 'members', label: t('groups.membersTab'), icon: 'group' },
  ];

  return (
    <div className="max-w-lg mx-auto pb-32 dark:bg-dark-bg min-h-screen">
      {/* ── HERO SECTION ────────────────────────────────────────────── */}
      <div className="relative w-full h-52 overflow-hidden">
        {group.cover_image_url ? (
          <>
            <img
              src={getFullImageUrl(group.cover_image_url)}
              alt={group.name}
              className="absolute inset-0 w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).parentElement!.style.background =
                  'linear-gradient(135deg, #c8956c 0%, #a0714f 100%)';
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            {/* Dark overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/60" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary-hover" />
        )}

        {/* Floating back + share buttons */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
          <button
            type="button"
            onClick={() => navigate('/groups')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-black/30 backdrop-blur-md border border-white/20 text-white text-sm font-medium hover:bg-black/45 transition-colors"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            {t('common.back')}
          </button>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => navigate(`/groups/${groupCode}/edit`)}
                className="p-2 rounded-full bg-black/30 backdrop-blur-md border border-white/20 text-white hover:bg-black/45 transition-colors"
                aria-label={t('groups.editGroup')}
              >
                <span className="material-symbols-outlined text-base">settings</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => shareUrl(group.name, window.location.href)}
              className="p-2 rounded-full bg-black/30 backdrop-blur-md border border-white/20 text-white hover:bg-black/45 transition-colors"
              aria-label={t('common.share')}
            >
              <span className="material-symbols-outlined text-base">share</span>
            </button>
          </div>
        </div>

        {/* Journey name + progress ring at bottom of hero */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 flex items-end justify-between z-10">
          <div className="flex-1 min-w-0 mr-3">
            <h1 className="text-xl font-bold text-white leading-tight line-clamp-2">
              {group.name}
            </h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-white/80 text-xs flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">person</span>
                {group.member_count ?? 0} {t('groups.members')}
              </span>
              {(group.start_date || group.end_date) && (
                <span className="text-white/80 text-xs flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">calendar_today</span>
                  {group.start_date}
                  {group.start_date && group.end_date ? ' – ' : ''}
                  {group.end_date}
                </span>
              )}
            </div>
          </div>
          {/* Progress ring */}
          <div className="flex flex-col items-center shrink-0">
            <div className="relative">
              <ProgressRing pct={pct} size={60} stroke={5} />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                {pct}%
              </span>
            </div>
            <span className="text-white/70 text-[10px] mt-0.5">{t('groups.groupProgress')}</span>
          </div>
        </div>
      </div>

      {/* Description + map link */}
      <div className="px-4 pt-3 pb-1 flex items-start justify-between gap-3">
        {group.description && (
          <p className="text-text-muted dark:text-dark-text-secondary text-sm flex-1">
            {group.description}
          </p>
        )}
        <Link
          to="/map"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-primary text-primary text-xs font-semibold hover:bg-primary/10 shrink-0 whitespace-nowrap"
        >
          <span className="material-symbols-outlined text-sm">map</span>
          {t('nav.map')}
        </Link>
      </div>

      {/* ── TAB PILLS ────────────────────────────────────────────────── */}
      <div className="relative flex px-4 pt-2 overflow-x-auto gap-1">
        {tabs.map((t_) => (
          <button
            key={t_.key}
            type="button"
            onClick={() => setTab(t_.key)}
            className={cn(
              'relative flex items-center gap-1.5 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors rounded-lg z-10',
              tab === t_.key
                ? 'text-primary'
                : 'text-slate-500 dark:text-dark-text-secondary hover:text-slate-700 dark:hover:text-white',
            )}
          >
            <span
              className={cn(
                'material-symbols-outlined text-lg transition-transform',
                tab === t_.key && 'scale-110',
              )}
            >
              {t_.icon}
            </span>
            <span>{t_.label}</span>
            {tab === t_.key && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 bg-primary/10 dark:bg-primary/15 rounded-lg -z-10"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>
      <div className="h-px bg-slate-200 dark:bg-dark-border" />

      {/* ── TAB CONTENT ───────────────────────────────────────────────── */}
      <div className="px-4 pt-5">
        <AnimatePresence mode="wait">
          {/* ROUTE TAB */}
          {tab === 'route' && (
            <motion.div
              key="route"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {checklist && checklist.total_places > 0 && (
                <div className="mb-5 space-y-2">
                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-dark-text-secondary mb-1">
                      <span>{t('groups.groupProgress')}</span>
                      <span>{checklist.group_progress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-dark-border overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${checklist.group_progress}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-dark-text-secondary mb-1">
                      <span>{t('groups.yourProgress')}</span>
                      <span>{checklist.personal_progress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-dark-border overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${checklist.personal_progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {!checklist || checklist.places.length === 0 ? (
                <div className="text-center py-10">
                  <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-dark-border mb-2">
                    route
                  </span>
                  <p className="text-slate-500 dark:text-dark-text-secondary font-medium">
                    {t('groups.noPlacesInItinerary')}
                  </p>
                  {isAdmin && (
                    <p className="text-sm text-slate-400 mt-1">
                      {t('groups.addPlacesToItinerary')}
                    </p>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => navigate(`/groups/${groupCode}/edit`)}
                      className="mt-4 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold"
                    >
                      {t('groups.editGroup')}
                    </button>
                  )}
                </div>
              ) : (
                /* ── TIMELINE ITINERARY ── */
                <ol className="relative">
                  {checklist.places.map((place, index) => (
                    <motion.div
                      key={place.place_code}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <li className="relative flex gap-3 mb-3">
                        {/* Left timeline line + badge */}
                        <div className="flex flex-col items-center shrink-0" style={{ width: 32 }}>
                          {/* Circular number badge */}
                          <div
                            className={cn(
                              'w-8 h-8 rounded-full flex items-center justify-center border-2 font-bold text-sm z-10',
                              place.user_checked_in
                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                : 'bg-white dark:bg-dark-surface border-primary text-primary',
                            )}
                          >
                            {place.user_checked_in ? (
                              <span className="material-symbols-outlined text-sm">check</span>
                            ) : (
                              index + 1
                            )}
                          </div>
                          {/* Connecting line (not after last item) */}
                          {index < checklist.places.length - 1 && (
                            <div className="w-0.5 flex-1 bg-slate-200 dark:bg-dark-border mt-1 min-h-[16px]" />
                          )}
                        </div>

                        {/* Place card */}
                        <div className="flex-1 rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface overflow-hidden mb-1">
                          <button
                            type="button"
                            className="w-full flex items-center gap-3 p-3 text-left"
                            onClick={() =>
                              setExpandedPlace(
                                expandedPlace === place.place_code ? null : place.place_code,
                              )
                            }
                          >
                            {place.image_url ? (
                              <img
                                src={getFullImageUrl(place.image_url ?? undefined)}
                                alt={place.name}
                                className="w-11 h-11 rounded-xl object-cover flex-shrink-0"
                              />
                            ) : (
                              <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-dark-border flex items-center justify-center flex-shrink-0">
                                <span className="material-icons text-slate-400 dark:text-dark-text-secondary text-xl">
                                  place
                                </span>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-slate-800 dark:text-white text-sm truncate">
                                {place.name}
                              </p>
                              {place.address && (
                                <p className="text-xs text-slate-400 dark:text-dark-text-secondary truncate">
                                  {place.address}
                                </p>
                              )}
                              {place.check_in_count > 0 && (
                                <div className="flex items-center gap-1 mt-1">
                                  <div className="flex -space-x-1">
                                    {place.checked_in_by.slice(0, 3).map((ci) => (
                                      <div
                                        key={ci.user_code}
                                        className="w-5 h-5 rounded-full bg-primary/20 border border-white dark:border-dark-surface flex items-center justify-center text-primary text-[10px] font-bold"
                                        title={ci.display_name}
                                      >
                                        {ci.display_name.charAt(0)}
                                      </div>
                                    ))}
                                  </div>
                                  <span className="text-[10px] text-slate-400 dark:text-dark-text-secondary">
                                    {place.check_in_count} {t('groups.checkedIn')}
                                  </span>
                                </div>
                              )}
                            </div>
                            {/* Inline check-in button (not yet checked) */}
                            {!place.user_checked_in && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCheckInModal({
                                    placeCode: place.place_code,
                                    placeName: place.name,
                                  });
                                }}
                                className="shrink-0 px-2.5 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90"
                              >
                                {t('groups.checkIn')}
                              </button>
                            )}
                            <span
                              className={cn(
                                'material-symbols-outlined text-slate-400 transition-transform ml-1',
                                expandedPlace === place.place_code && 'rotate-180',
                              )}
                            >
                              expand_more
                            </span>
                          </button>

                          {/* Expanded content */}
                          {expandedPlace === place.place_code && (
                            <div className="px-4 pb-4 border-t border-slate-100 dark:border-dark-border pt-3 space-y-3">
                              <div className="flex gap-2">
                                <Link
                                  to={`/places/${place.place_code}`}
                                  className="flex-1 py-2 text-center text-sm font-semibold text-primary border border-primary rounded-xl hover:bg-primary/10"
                                >
                                  {t('home.details')}
                                </Link>
                                {!place.user_checked_in && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCheckInModal({
                                        placeCode: place.place_code,
                                        placeName: place.name,
                                      })
                                    }
                                    className="flex-1 py-2 text-center text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary/90"
                                  >
                                    {t('groups.checkIn')}
                                  </button>
                                )}
                              </div>

                              {/* Who checked in */}
                              {place.checked_in_by.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-slate-500 dark:text-dark-text-secondary mb-1">
                                    {t('groups.checkedIn')}
                                  </p>
                                  <div className="space-y-1">
                                    {place.checked_in_by.map((ci) => (
                                      <div
                                        key={ci.user_code}
                                        className="flex items-center gap-2 text-sm"
                                      >
                                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                                          {ci.display_name.charAt(0)}
                                        </div>
                                        <span className="font-medium text-slate-700 dark:text-white">
                                          {ci.display_name}
                                        </span>
                                        <span className="text-xs text-slate-400">
                                          {new Date(ci.checked_in_at).toLocaleDateString()}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Notes */}
                              <div>
                                {place.notes.length > 0 && (
                                  <div className="space-y-1.5 mb-3">
                                    {place.notes.map((note) => (
                                      <div
                                        key={note.note_code}
                                        className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 dark:bg-dark-bg"
                                      >
                                        <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold flex-shrink-0">
                                          {(note.display_name || '?').charAt(0)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs text-slate-700 dark:text-white">
                                            {note.text}
                                          </p>
                                          <p className="text-[10px] text-slate-400 mt-0.5">
                                            {note.display_name}
                                          </p>
                                        </div>
                                        {(note.user_code === user?.user_code || isAdmin) && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleDeleteNote(place.place_code, note.note_code)
                                            }
                                            className="p-1 text-slate-400 hover:text-red-500"
                                            aria-label="Delete note"
                                          >
                                            <span className="material-symbols-outlined text-sm">
                                              delete
                                            </span>
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {/* WhatsApp-style note input */}
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={noteInputs[place.place_code] ?? ''}
                                    onChange={(e) =>
                                      setNoteInputs((prev) => ({
                                        ...prev,
                                        [place.place_code]: e.target.value,
                                      }))
                                    }
                                    placeholder={t('groups.writeNote')}
                                    className="flex-1 h-10 text-xs border border-slate-200 dark:border-dark-border rounded-full px-4 bg-white dark:bg-dark-bg text-slate-700 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleAddNote(place.place_code);
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleAddNote(place.place_code)}
                                    disabled={
                                      noteSubmitting[place.place_code] ||
                                      !noteInputs[place.place_code]?.trim()
                                    }
                                    className="w-9 h-9 rounded-full bg-primary flex items-center justify-center flex-shrink-0 disabled:opacity-50 hover:bg-primary-hover transition-colors"
                                  >
                                    {noteSubmitting[place.place_code] ? (
                                      <span className="material-symbols-outlined animate-spin text-white text-sm">
                                        progress_activity
                                      </span>
                                    ) : (
                                      <span className="material-symbols-outlined text-white text-sm">
                                        send
                                      </span>
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </li>
                    </motion.div>
                  ))}
                </ol>
              )}
            </motion.div>
          )}

          {/* ACTIVITY TAB */}
          {tab === 'activity' && (
            <motion.div
              key="activity"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {activity.length === 0 ? (
                <p className="text-text-muted dark:text-dark-text-secondary text-sm py-4">
                  {t('groups.noRecentActivity')}
                </p>
              ) : (
                <ul className="space-y-3">
                  {activity.map((item, i) => (
                    <li key={`${item.user_code}-${item.place_code}-${i}`}>
                      <Link
                        to={`/places/${item.place_code}`}
                        className="flex items-start gap-3 p-4 rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-slate-50 dark:hover:bg-dark-surface/80 transition-all"
                      >
                        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 font-bold shrink-0">
                          {(item.display_name || '?').charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-600 dark:text-slate-300">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {item.display_name}
                            </span>{' '}
                            {t('groups.checkedInAt')}{' '}
                            <span className="font-bold text-primary">{item.place_name}</span>
                          </p>
                          {item.note && (
                            <p className="text-xs text-slate-500 dark:text-dark-text-secondary mt-0.5 italic">
                              "{item.note}"
                            </p>
                          )}
                          <p className="text-[10px] text-slate-400 mt-1">
                            {new Date(item.checked_in_at).toLocaleString()}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}

          {/* MEMBERS TAB */}
          {tab === 'members' && (
            <motion.div
              key="members"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <div className="space-y-3">
                {members.map((member) => (
                  <div
                    key={member.user_code}
                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold shrink-0">
                      {member.display_name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 dark:text-white text-sm">
                        {member.display_name}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-dark-text-secondary">
                        {member.role === 'admin' ? t('groups.admin') : t('groups.member')}
                        {member.is_creator ? ' · Creator' : ''}
                      </p>
                    </div>
                    {isAdmin && member.user_code !== user?.user_code && !member.is_creator && (
                      <div className="flex gap-1">
                        {member.role === 'member' ? (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmAction({
                                type: 'promote',
                                userCode: member.user_code,
                                displayName: member.display_name,
                              })
                            }
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-border hover:text-primary"
                            title={t('groups.promoteMember')}
                          >
                            <span className="material-symbols-outlined text-sm">arrow_upward</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmAction({
                                type: 'demote',
                                userCode: member.user_code,
                                displayName: member.display_name,
                              })
                            }
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-border hover:text-slate-600"
                            title={t('groups.demoteMember')}
                          >
                            <span className="material-symbols-outlined text-sm">
                              arrow_downward
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({
                              type: 'remove',
                              userCode: member.user_code,
                              displayName: member.display_name,
                            })
                          }
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500"
                          title={t('groups.removeMember')}
                        >
                          <span className="material-symbols-outlined text-sm">person_remove</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                <div className="pt-4 space-y-2 border-t border-slate-200 dark:border-dark-border">
                  {!isCreator && (
                    <button
                      type="button"
                      onClick={() => setConfirmAction({ type: 'leave' })}
                      className="w-full py-3 rounded-xl border border-slate-200 dark:border-dark-border text-slate-600 dark:text-dark-text-secondary text-sm font-semibold hover:bg-slate-50 dark:hover:bg-dark-border flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-base">logout</span>
                      {t('groups.leaveGroup')}
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setConfirmAction({ type: 'delete' })}
                      className="w-full py-3 rounded-xl border border-red-200 dark:border-red-900 text-red-500 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-base">delete</span>
                      {t('groups.deleteGroup')}
                    </button>
                  )}
                </div>

                {inviteUrl && (
                  <div className="pt-2">
                    <p className="text-xs text-slate-500 dark:text-dark-text-secondary mb-2">
                      {t('groups.shareInviteLink')}
                    </p>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={inviteUrl}
                        className="flex-1 text-xs border border-slate-200 dark:border-dark-border rounded-xl px-3 py-2.5 bg-white dark:bg-dark-surface text-slate-600 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => shareUrl(group.name, inviteUrl)}
                        className="px-3 py-2.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-sm">share</span>
                        {t('common.share')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Leaderboard section in members tab */}
                {leaderboard.length > 0 && (
                  <div className="pt-4 border-t border-slate-200 dark:border-dark-border">
                    <p className="text-sm font-bold text-slate-700 dark:text-white mb-3">
                      {t('groups.leaderboard')}
                    </p>
                    <div className="flex justify-center items-end gap-3 mb-4 pt-2 px-2">
                      {leaderboard[1] && (
                        <div className="flex flex-col items-center flex-1">
                          <div className="w-12 h-12 rounded-full border-2 border-slate-200 bg-white dark:bg-dark-surface flex items-center justify-center text-slate-700 dark:text-white font-bold text-base mb-2">
                            {leaderboard[1].display_name.charAt(0)}
                          </div>
                          <p className="text-xs font-bold text-slate-700 dark:text-white truncate w-full text-center">
                            {leaderboard[1].display_name}
                          </p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-tight">
                            {leaderboard[1].places_visited} {t('groups.places')}
                          </p>
                          <div className="mt-3 h-14 w-full rounded-t-xl bg-slate-100 dark:bg-dark-border" />
                        </div>
                      )}
                      {leaderboard[0] && (
                        <div className="flex flex-col items-center flex-1 z-10">
                          <div className="w-16 h-16 rounded-full border-[3px] border-amber-400 bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center text-amber-800 dark:text-amber-300 font-black text-xl mb-2">
                            {leaderboard[0].display_name.charAt(0)}
                          </div>
                          <p className="text-xs font-black text-slate-800 dark:text-white truncate w-full text-center">
                            {leaderboard[0].display_name}
                          </p>
                          <p className="text-[10px] font-bold text-amber-600 uppercase tracking-tight">
                            {leaderboard[0].places_visited} {t('groups.places')}
                          </p>
                          <div className="mt-3 h-20 w-full rounded-t-xl bg-amber-100 dark:bg-amber-900/20" />
                        </div>
                      )}
                      {leaderboard[2] && (
                        <div className="flex flex-col items-center flex-1">
                          <div className="w-12 h-12 rounded-full border-2 border-orange-200 bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center text-orange-700 dark:text-orange-300 font-bold text-base mb-2">
                            {leaderboard[2].display_name.charAt(0)}
                          </div>
                          <p className="text-xs font-bold text-slate-700 dark:text-white truncate w-full text-center">
                            {leaderboard[2].display_name}
                          </p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-tight">
                            {leaderboard[2].places_visited} {t('groups.places')}
                          </p>
                          <div className="mt-3 h-10 w-full rounded-t-xl bg-orange-100 dark:bg-orange-900/20" />
                        </div>
                      )}
                    </div>
                    {leaderboard.length > 3 && (
                      <>
                        {(showFullLeaderboard ? leaderboard : leaderboard.slice(3)).map((entry) => (
                          <div
                            key={entry.user_code}
                            className="flex items-center gap-3 p-3 rounded-xl border border-input-border dark:border-dark-border bg-surface dark:bg-dark-surface mb-2"
                          >
                            <span className="text-sm font-medium text-text-muted dark:text-dark-text-secondary w-6">
                              #{entry.rank}
                            </span>
                            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold shrink-0">
                              {entry.display_name.charAt(0)}
                            </div>
                            <span className="font-medium text-text-main dark:text-white flex-1 truncate">
                              {entry.display_name}
                            </span>
                            <span className="text-sm text-text-muted dark:text-dark-text-secondary">
                              {entry.places_visited} {t('groups.places')}
                            </span>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => setShowFullLeaderboard((v) => !v)}
                          className="text-primary font-medium text-sm mt-2"
                        >
                          {showFullLeaderboard
                            ? t('common.showLess')
                            : t('groups.viewFullLeaderboard')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Ad banner */}
      <div className="px-6 pb-6 mt-4">
        <AdBanner slot="group-detail-bottom" format="horizontal" />
      </div>

      {/* ── GLASS CONTEXTUAL BOTTOM BAR ──────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pointer-events-none">
        <div className="w-full max-w-lg px-4 pb-safe pointer-events-auto">
          <div className="mb-3 mx-1 px-4 py-3 rounded-2xl bg-white/80 dark:bg-dark-surface/80 backdrop-blur-md border border-white/30 dark:border-dark-border/60 shadow-lg flex items-center gap-2">
            {isAdmin ? (
              <>
                <button
                  type="button"
                  onClick={() => navigate(`/groups/${groupCode}/edit`)}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-primary/90 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">add_location</span>
                  {t('groups.addPlace')}
                </button>
                <button
                  type="button"
                  onClick={() => shareUrl(group.name, window.location.href)}
                  className="flex-1 py-2.5 rounded-xl border border-primary text-primary text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-primary/10 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">share</span>
                  {t('common.share')}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => shareUrl(group.name, inviteUrl || window.location.href)}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-primary/90 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">person_add</span>
                {t('journey.inviteFriends')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirm dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setConfirmAction(null)}
            aria-hidden="true"
          />
          <div className="relative bg-white dark:bg-dark-surface rounded-2xl p-6 mx-4 max-w-sm w-full shadow-xl">
            <h3 className="font-bold text-slate-800 dark:text-white mb-2">
              {confirmAction.type === 'leave' && t('groups.leaveGroup')}
              {confirmAction.type === 'delete' && t('groups.deleteGroup')}
              {confirmAction.type === 'remove' && t('groups.removeMember')}
              {confirmAction.type === 'promote' && t('groups.promoteMember')}
              {confirmAction.type === 'demote' && t('groups.demoteMember')}
            </h3>
            <p className="text-sm text-slate-500 dark:text-dark-text-secondary mb-5">
              {confirmAction.type === 'leave' && t('groups.confirmLeave')}
              {confirmAction.type === 'delete' && t('groups.confirmDelete')}
              {(confirmAction.type === 'remove' ||
                confirmAction.type === 'promote' ||
                confirmAction.type === 'demote') &&
                `${confirmAction.displayName}?`}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-dark-border text-slate-600 dark:text-dark-text-secondary text-sm font-semibold"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => {
                  if (confirmAction.type === 'leave') handleLeave();
                  else if (confirmAction.type === 'delete') handleDelete();
                  else if (confirmAction.type === 'remove' && confirmAction.userCode)
                    handleRemoveMember(confirmAction.userCode);
                  else if (confirmAction.type === 'promote' && confirmAction.userCode)
                    handleRoleChange(confirmAction.userCode, 'admin');
                  else if (confirmAction.type === 'demote' && confirmAction.userCode)
                    handleRoleChange(confirmAction.userCode, 'member');
                }}
                className={cn(
                  'flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60',
                  confirmAction.type === 'delete' || confirmAction.type === 'remove'
                    ? 'bg-red-500'
                    : 'bg-primary',
                )}
              >
                {actionLoading ? t('common.loading') : t('common.done')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Check-in modal */}
      {checkInModal && (
        <GroupCheckInModal
          groupCode={groupCode}
          placeCode={checkInModal.placeCode}
          placeName={checkInModal.placeName}
          onClose={() => setCheckInModal(null)}
          onSuccess={() => {
            setCheckInModal(null);
            fetchData();
          }}
        />
      )}

      {/* Glass contextual bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-[600] bg-white/90 dark:bg-dark-bg/90 backdrop-blur-lg border-t border-white/30 dark:border-white/5 px-4 py-3 flex items-center justify-center gap-3">
        {isAdmin || isCreator ? (
          <>
            <button
              type="button"
              onClick={() => navigate(`/journeys/${groupCode}/edit-places`)}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 active:scale-[0.97] transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">add_location_alt</span>
              {t('groups.addPlace')}
            </button>
            <button
              type="button"
              onClick={() => shareUrl(inviteUrl, group?.name ?? 'Journey')}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-input-border dark:border-dark-border text-text-main dark:text-white text-sm font-semibold hover:bg-soft-blue dark:hover:bg-dark-surface active:scale-[0.97] transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">share</span>
              {t('common.share')}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => shareUrl(inviteUrl, group?.name ?? 'Journey')}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 active:scale-[0.97] transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            {t('journey.inviteFriends')}
          </button>
        )}
      </div>
    </div>
  );
}
