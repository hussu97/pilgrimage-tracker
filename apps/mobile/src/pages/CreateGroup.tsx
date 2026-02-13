import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createGroup } from '@/api/client';

export default function CreateGroup() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const g = await createGroup({ name: name.trim(), description: description.trim() || undefined, is_private: isPrivate });
      setInviteCode(g.invite_code);
      setTimeout(() => navigate(`/groups/${g.group_code}`), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  };

  if (inviteCode) {
    const inviteUrl = `${window.location.origin}/join?code=${inviteCode}`;
    return (
      <div className="max-w-md mx-auto px-5 py-8">
        <p className="text-primary font-medium mb-2">Group created!</p>
        <p className="text-sm text-text-muted mb-3">Share this link to invite others:</p>
        <div className="flex gap-2">
          <input readOnly value={inviteUrl} className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50" />
          <button type="button" onClick={() => navigator.clipboard.writeText(inviteUrl)} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium">Copy</button>
        </div>
        <p className="text-xs text-text-muted mt-2">Redirecting to group...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-5 py-6">
      <h1 className="text-xl font-bold text-text-main mb-4">Create group</h1>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-main mb-1">Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full border border-gray-200 rounded-xl px-4 py-3" />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-main mb-1">Description (optional)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-3 min-h-[80px]" />
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
          <span className="text-sm text-text-main">Private group</span>
        </label>
        <div className="flex gap-3">
          <button type="button" onClick={() => navigate(-1)} className="flex-1 py-3 rounded-xl border border-gray-200 text-text-main font-medium">Cancel</button>
          <button type="submit" disabled={submitting} className="flex-1 py-3 rounded-xl bg-primary text-white font-medium disabled:opacity-50">{submitting ? 'Creating...' : 'Create'}</button>
        </div>
      </form>
    </div>
  );
}
