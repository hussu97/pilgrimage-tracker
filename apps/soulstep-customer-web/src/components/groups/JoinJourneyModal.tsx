'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from '@/lib/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n, useFeedback } from '@/app/providers';
import { getGroupByInviteCode, joinGroupByCode } from '@/lib/api/client';

interface Props {
  open: boolean;
  onClose: () => void;
}

type ModalState = 'idle' | 'loading' | 'preview' | 'joining' | 'success' | 'error';

export default function JoinJourneyModal({ open, onClose }: Props) {
  const { t } = useI18n();
  const { showSuccess } = useFeedback();
  const navigate = useNavigate();

  const [code, setCode] = useState('');
  const [state, setState] = useState<ModalState>('idle');
  const [preview, setPreview] = useState<{ group_code: string; name: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on open/close
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setCode('');
        setState('idle');
        setPreview(null);
        setErrorMsg('');
      }, 300);
    }
  }, [open]);

  // Debounced preview fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (code.length < 6) {
      if (state === 'preview' || state === 'loading') setState('idle');
      setPreview(null);
      return;
    }
    setState('loading');
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await getGroupByInviteCode(code);
        setPreview(data);
        setState('preview');
        setErrorMsg('');
      } catch (err) {
        setPreview(null);
        setState('error');
        const msg = err instanceof Error ? err.message : '';
        if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('invalid')) {
          setErrorMsg(t('groups.invalidCode') || 'Invalid code');
        } else {
          setErrorMsg(msg || t('common.error'));
        }
      }
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setCode(text.trim());
    } catch {
      // clipboard access denied — ignore
    }
  }, []);

  const handleJoin = useCallback(async () => {
    if (!preview || !code) return;
    setState('joining');
    try {
      const { group_code } = await joinGroupByCode(code);
      setState('success');
      showSuccess(t('feedback.groupJoined'));
      setTimeout(() => {
        onClose();
        navigate(`/journeys/${group_code}`);
      }, 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes('already')) {
        setErrorMsg(t('groups.alreadyMember') || 'Already a member');
      } else if (msg.toLowerCase().includes('full')) {
        setErrorMsg(t('groups.journeyFull') || 'Journey is full');
      } else {
        setErrorMsg(msg || t('common.error'));
      }
      setState('error');
    }
  }, [code, preview, navigate, onClose, showSuccess, t]);

  const handleClose = useCallback(() => {
    if (state === 'joining') return;
    onClose();
  }, [state, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[800] bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Modal — slides up */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            className="fixed bottom-0 left-0 right-0 z-[801] flex justify-center"
          >
            <div
              className="w-full max-w-lg bg-white dark:bg-dark-surface rounded-t-3xl shadow-2xl border border-white/20 dark:border-dark-border px-6 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Handle bar */}
              <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-dark-border mx-auto mb-5" />

              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('groups.joinGroup')}
                </h2>
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-8 h-8 rounded-full bg-slate-100 dark:bg-dark-border flex items-center justify-center text-slate-500 dark:text-dark-text-secondary hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                  aria-label={t('common.close') || 'Close'}
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>

              {/* Code input */}
              <div className="flex gap-2 mb-4">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.trim())}
                    placeholder={t('groups.enterInviteCode') || 'Enter invite code…'}
                    className="w-full h-12 px-4 text-sm font-mono border-2 border-slate-200 dark:border-dark-border rounded-2xl bg-slate-50 dark:bg-dark-bg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-dark-text-secondary focus:outline-none focus:border-primary transition-colors"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                  {state === 'loading' && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined animate-spin text-primary text-lg">
                      progress_activity
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handlePaste}
                  className="h-12 px-4 rounded-2xl border-2 border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-bg text-slate-600 dark:text-dark-text-secondary text-xs font-semibold hover:border-primary hover:text-primary transition-colors whitespace-nowrap"
                >
                  <span className="material-symbols-outlined text-base align-middle mr-1">
                    content_paste
                  </span>
                  {t('common.paste') || 'Paste'}
                </button>
              </div>

              {/* Preview card */}
              <AnimatePresence mode="wait">
                {state === 'preview' && preview && (
                  <motion.div
                    key="preview"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="mb-4 p-4 rounded-2xl border border-primary/20 bg-primary/5 dark:bg-primary/10 flex items-center gap-3"
                  >
                    <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                      <span
                        className="material-symbols-outlined text-2xl text-primary"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        route
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-0.5">
                        {t('groups.journeyFound') || 'Journey Found'}
                      </p>
                      <p className="font-bold text-slate-900 dark:text-white truncate">
                        {preview.name}
                      </p>
                    </div>
                    <span
                      className="material-symbols-outlined text-primary"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      check_circle
                    </span>
                  </motion.div>
                )}

                {state === 'success' && (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mb-4 flex flex-col items-center gap-2 py-4"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: [0, 1.2, 0.95, 1] }}
                      transition={{ duration: 0.5, times: [0, 0.4, 0.7, 1] }}
                      className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center"
                    >
                      <span
                        className="material-symbols-outlined text-4xl text-emerald-500"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        check_circle
                      </span>
                    </motion.div>
                    <p className="font-bold text-emerald-600 dark:text-emerald-400">
                      {t('feedback.groupJoined') || 'Joined!'}
                    </p>
                  </motion.div>
                )}

                {state === 'error' && errorMsg && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                  >
                    <p className="text-sm text-red-600 dark:text-red-400 font-medium">{errorMsg}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Join button */}
              {state !== 'success' && (
                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={state !== 'preview' || !preview}
                  className="w-full py-3.5 rounded-2xl bg-primary text-white font-bold text-sm hover:bg-primary-hover active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {state === 'joining' && (
                    <span className="material-symbols-outlined animate-spin text-base">
                      progress_activity
                    </span>
                  )}
                  {state === 'joining'
                    ? t('common.loading') || 'Joining…'
                    : t('groups.join') || 'Join Journey'}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
