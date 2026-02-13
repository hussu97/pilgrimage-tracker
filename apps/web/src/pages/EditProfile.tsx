import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { updateMe, updateReligion } from '@/api/client';
import type { Religion } from '@/types';

export default function EditProfile() {
  const { user, setUser, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [religion, setReligion] = useState<Religion | ''>(user?.religion ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      await updateMe({ display_name: displayName });
      if (religion !== '' && religion !== user.religion) {
        await updateReligion(religion as Religion);
      }
      await refreshUser();
      navigate('/profile');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-md mx-auto px-5 py-6">
      <h1 className="text-xl font-bold text-text-main mb-4">Edit profile</h1>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-text-main mb-1">Display name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-text-main"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-main mb-1">Religion</label>
          <select
            value={religion}
            onChange={(e) => setReligion(e.target.value as Religion | '')}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-text-main"
          >
            <option value="">Skip</option>
            <option value="islam">Islam</option>
            <option value="hinduism">Hinduism</option>
            <option value="christianity">Christianity</option>
          </select>
        </div>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={() => navigate(-1)} className="flex-1 py-3 rounded-xl border border-gray-200 text-text-main font-medium">
          Cancel
        </button>
        <button type="button" onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-primary text-white font-medium disabled:opacity-50">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
