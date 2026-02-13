import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import type { Religion } from '@/types';

export default function SelectPath() {
  const navigate = useNavigate();
  const { user, setReligion } = useAuth();

  async function handleSelect(religion: Religion | null) {
    try {
      await setReligion(religion);
      navigate('/home');
    } catch {
      // keep on page
    }
  }

  if (user?.religion) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="max-w-md mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-text-main mb-2">Select Your Path</h1>
      <p className="text-text-muted mb-8">Choose a faith to personalize your experience.</p>
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => handleSelect('islam')}
          className="w-full p-4 border border-input-border rounded-xl text-left flex items-center gap-4 hover:border-primary/50 transition-colors"
        >
          <span className="material-symbols-outlined text-2xl text-emerald-600">mosque</span>
          <span className="font-medium">Islam</span>
        </button>
        <button
          type="button"
          onClick={() => handleSelect('hinduism')}
          className="w-full p-4 border border-input-border rounded-xl text-left flex items-center gap-4 hover:border-primary/50 transition-colors"
        >
          <span className="material-symbols-outlined text-2xl text-orange-600">temple_hindu</span>
          <span className="font-medium">Hinduism</span>
        </button>
        <button
          type="button"
          onClick={() => handleSelect('christianity')}
          className="w-full p-4 border border-input-border rounded-xl text-left flex items-center gap-4 hover:border-primary/50 transition-colors"
        >
          <span className="material-symbols-outlined text-2xl text-blue-600">church</span>
          <span className="font-medium">Christianity</span>
        </button>
      </div>
      <button
        type="button"
        onClick={() => handleSelect(null)}
        className="block mt-8 w-full text-center text-sm text-text-muted hover:text-primary"
      >
        Skip for now
      </button>
    </div>
  );
}
