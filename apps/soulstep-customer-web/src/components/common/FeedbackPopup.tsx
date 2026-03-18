import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { COLORS } from '@/lib/colors';

interface FeedbackPopupProps {
  visible: boolean;
  type: 'success' | 'error';
  message: string;
}

const CHECK_PATH = 'M6 13l4 4L18 7';
const CROSS_PATH = 'M6 6l12 12M18 6L6 18';

export default function FeedbackPopup({ visible, type, message }: FeedbackPopupProps) {
  const isSuccess = type === 'success';
  const iconColor = isSuccess ? COLORS.openNow : COLORS.closedNow;
  const iconBg = isSuccess ? COLORS.openNowAlpha12 : COLORS.closedNowAlpha12;
  const path = isSuccess ? CHECK_PATH : CROSS_PATH;

  return createPortal(
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            key="feedback-backdrop"
            className="fixed inset-0 z-[3000] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />

          {/* Card */}
          <motion.div
            key="feedback-card"
            role="status"
            aria-live="polite"
            className="fixed inset-0 z-[3001] flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
          >
            <div className="bg-white dark:bg-dark-surface rounded-3xl shadow-elevated px-10 py-8 flex flex-col items-center gap-4 min-w-[200px] max-w-xs mx-4">
              {/* Animated SVG icon */}
              <div
                className="flex items-center justify-center rounded-full w-16 h-16"
                style={{ backgroundColor: iconBg }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={iconColor}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-8 h-8"
                >
                  <motion.path
                    d={path}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.4, delay: 0.1, ease: 'easeOut' }}
                  />
                </svg>
              </div>

              {/* Message */}
              <p className="text-text-main dark:text-white font-semibold text-center text-base leading-snug">
                {message}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
