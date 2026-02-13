import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { joinGroupByCode, getGroupByInviteCode } from '@/api/client';

export default function JoinGroup() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const code = searchParams.get('code');
  const [groupName, setGroupName] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!code) {
      setError('No invite code provided');
      return;
    }
    getGroupByInviteCode(code)
      .then((g) => setGroupName(g.name))
      .catch((e) => setError(e instanceof Error ? e.message : 'Invalid invite'));
  }, [code]);

  const handleJoin = async () => {
    if (!code) return;
    setJoining(true);
    setError('');
    try {
      const result = await joinGroupByCode(code);
      setDone(true);
      setTimeout(() => navigate(`/groups/${result.group_code}`), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  if (!code) {
    return (
      <div className="max-w-md mx-auto px-5 py-12 text-center">
        <p className="text-red-600 mb-4">Missing invite code. Use the link shared by a group member.</p>
        <button type="button" onClick={() => navigate('/groups')} className="text-primary font-medium">Go to My Groups</button>
      </div>
    );
  }

  if (error && !groupName) {
    return (
      <div className="max-w-md mx-auto px-5 py-12 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <button type="button" onClick={() => navigate('/groups')} className="text-primary font-medium">Go to My Groups</button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="max-w-md mx-auto px-5 py-12 text-center">
        <p className="text-primary font-medium">You joined the group! Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-5 py-12">
      <h1 className="text-xl font-bold text-text-main mb-2">Join group</h1>
      {groupName && <p className="text-text-muted mb-6">You've been invited to join <strong>{groupName}</strong>.</p>}
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={() => navigate('/groups')} className="flex-1 py-3 rounded-xl border border-gray-200 text-text-main font-medium">Decline</button>
        <button type="button" onClick={handleJoin} disabled={joining} className="flex-1 py-3 rounded-xl bg-primary text-white font-medium disabled:opacity-50">{joining ? 'Joining...' : 'Join'}</button>
      </div>
    </div>
  );
}
