'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from '@/lib/navigation';
import { useI18n } from '@/app/providers';
import { getGroup, updateGroup, getGroupMembers, getPlaces } from '@/lib/api/client';
import { useAuth } from '@/app/providers';
import PlaceSelector from '@/components/groups/PlaceSelector';
import type { Place } from '@/lib/types';

export default function EditGroupPlaces() {
  const { groupCode } = useParams<{ groupCode: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user } = useAuth();

  const [selectedPlaceCodes, setSelectedPlaceCodes] = useState<string[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    if (!groupCode) return;
    setLoading(true);
    try {
      const [g, members] = await Promise.all([getGroup(groupCode), getGroupMembers(groupCode)]);
      const isAdmin = members.some((m) => m.user_code === user?.user_code && m.role === 'admin');
      if (!isAdmin) {
        navigate(`/groups/${groupCode}`);
        return;
      }
      setSelectedPlaceCodes(g.path_place_codes ?? []);
    } catch {
      navigate(`/groups/${groupCode}/edit`);
    } finally {
      setLoading(false);
    }
  }, [groupCode, user?.user_code, navigate]);

  useEffect(() => {
    fetchData();
    setPlacesLoading(true);
    getPlaces({ page_size: 100 })
      .then((res) => setPlaces(res.places ?? []))
      .catch(() => {})
      .finally(() => setPlacesLoading(false));
  }, [fetchData]);

  const handleSave = async () => {
    if (!groupCode) return;
    setSaving(true);
    setError('');
    try {
      await updateGroup(groupCode, { path_place_codes: selectedPlaceCodes });
      navigate(`/groups/${groupCode}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="material-symbols-outlined animate-spin text-primary text-3xl">
          progress_activity
        </span>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 dark:bg-dark-bg min-h-screen flex flex-col">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`/groups/${groupCode}/edit`)}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-dark-surface"
          >
            <span className="material-symbols-outlined text-slate-600 dark:text-white">
              arrow_back
            </span>
          </button>
          <h1 className="text-xl font-bold text-text-main dark:text-white">
            {t('groups.manageItinerary')}
          </h1>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover disabled:opacity-50"
        >
          {saving ? t('common.loading') : t('groups.saveItinerary')}
        </button>
      </div>

      {error && (
        <p className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg mb-4">
          {error}
        </p>
      )}

      <div className="flex-1">
        <PlaceSelector
          selectedCodes={selectedPlaceCodes}
          onChange={setSelectedPlaceCodes}
          places={places}
          loading={placesLoading}
        />
      </div>
    </div>
  );
}
