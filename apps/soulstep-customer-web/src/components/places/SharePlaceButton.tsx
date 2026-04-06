import { useState } from 'react';
import { shareUrl } from '@/lib/share';
import { useI18n } from '@/app/providers';

const API_BASE = '';

interface SharePlaceButtonProps {
  placeName: string;
  placeCode: string;
  variant?: 'default' | 'glass';
}

export function SharePlaceButton({
  placeName,
  placeCode,
  variant = 'default',
}: SharePlaceButtonProps) {
  const { t } = useI18n();
  const [status, setStatus] = useState<'idle' | 'shared' | 'copied'>('idle');

  const handleShare = async () => {
    const shareBackendUrl = `${API_BASE}/share/places/${placeCode}`;
    const result = await shareUrl(placeName, shareBackendUrl);
    setStatus(result === 'shared' ? 'shared' : 'copied');
    setTimeout(() => setStatus('idle'), 2000);
  };

  if (variant === 'glass') {
    return (
      <button
        type="button"
        onClick={handleShare}
        className="w-11 h-11 rounded-full bg-black/35 flex items-center justify-center text-white hover:bg-black/50 transition-all border border-white/20"
        aria-label={t('common.share')}
        title={
          status !== 'idle'
            ? status === 'copied'
              ? t('common.linkCopied')
              : t('common.shared')
            : t('common.share')
        }
      >
        <span className="material-symbols-outlined text-[20px]">share</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="p-3 rounded-xl border border-input-border text-text-main hover:bg-gray-50"
      aria-label="Share"
      title={status !== 'idle' ? (status === 'copied' ? 'Link copied' : 'Shared') : 'Share'}
    >
      <span className="material-symbols-outlined">share</span>
    </button>
  );
}
