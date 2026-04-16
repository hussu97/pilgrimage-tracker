'use client';

/**
 * Onboarding — full-screen 3-card swipeable flow shown on first visit.
 * After completion (or skip), sets localStorage 'onboarding_done' = '1'
 * and redirects to /home.
 */
import { useState } from 'react';
import { useNavigate } from '@/lib/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '@/app/providers';

interface Card {
  titleKey: string;
  descKey: string;
  icon: string;
  gradient: string;
}

const CARDS: Card[] = [
  {
    titleKey: 'onboarding.card1Title',
    descKey: 'onboarding.card1Desc',
    icon: 'auto_stories',
    gradient: 'from-primary/20 to-amber-500/10',
  },
  {
    titleKey: 'onboarding.card2Title',
    descKey: 'onboarding.card2Desc',
    icon: 'route',
    gradient: 'from-blue-500/20 to-cyan-500/10',
  },
  {
    titleKey: 'onboarding.card3Title',
    descKey: 'onboarding.card3Desc',
    icon: 'explore',
    gradient: 'from-emerald-500/20 to-teal-500/10',
  },
];

const cardVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir < 0 ? '100%' : '-100%', opacity: 0 }),
};

export default function Onboarding() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  function finish() {
    localStorage.setItem('onboarding_done', '1');
    navigate('/home', { replace: true });
  }

  function next() {
    if (index < CARDS.length - 1) {
      setDirection(1);
      setIndex((i) => i + 1);
    } else {
      finish();
    }
  }

  const card = CARDS[index];
  const isLast = index === CARDS.length - 1;

  return (
    <div className="min-h-screen bg-onboarding-bg dark:bg-dark-bg flex flex-col overflow-hidden">
      {/* Skip button */}
      <div className="flex justify-end p-4 lg:p-6">
        <button
          onClick={finish}
          className="text-sm font-medium text-slate-500 dark:text-dark-text-secondary hover:text-primary transition-colors px-3 py-1"
        >
          {t('onboarding.skip')}
        </button>
      </div>

      {/* Center column */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-6 gap-0">
        {/* ── Logo ─────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="mb-6 lg:mb-8 flex flex-col items-center"
        >
          <div className="relative">
            {/* Soft glow halo behind logo */}
            <div className="absolute inset-0 rounded-[28px] bg-primary/10 blur-2xl scale-110" />
            <img
              src="/logo.png"
              alt="SoulStep"
              className="relative w-28 h-28 lg:w-40 lg:h-40 xl:w-44 xl:h-44 rounded-[28px] shadow-xl dark:ring-2 dark:ring-white/10"
              draggable={false}
            />
          </div>
        </motion.div>

        {/* ── Sliding cards ─────────────────────────────────────────── */}
        <div
          className="w-full max-w-sm lg:max-w-md relative overflow-hidden"
          style={{ height: 340 }}
        >
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.div
              key={index}
              custom={direction}
              variants={cardVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'tween', duration: 0.35 }}
              className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${card.gradient} flex flex-col items-center justify-center p-8 border border-white/60 dark:border-dark-border shadow-lg backdrop-blur-sm`}
            >
              {/* Icon */}
              <div className="mb-6 w-20 h-20 rounded-full bg-white/60 dark:bg-dark-surface/60 flex items-center justify-center shadow-sm ring-1 ring-white/80 dark:ring-white/10">
                <span className="material-symbols-outlined text-5xl text-primary">{card.icon}</span>
              </div>

              {/* Title */}
              <h2 className="text-2xl lg:text-3xl font-bold text-slate-800 dark:text-white text-center mb-3">
                {t(card.titleKey)}
              </h2>

              {/* Description */}
              <p className="text-base text-slate-600 dark:text-dark-text-secondary text-center leading-relaxed">
                {t(card.descKey)}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Dot indicators ────────────────────────────────────────── */}
        <div className="flex gap-2 mt-6">
          {CARDS.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setDirection(i > index ? 1 : -1);
                setIndex(i);
              }}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === index ? 'w-6 bg-primary' : 'w-2 bg-slate-300 dark:bg-dark-border'
              }`}
              aria-label={`Go to card ${i + 1}`}
            />
          ))}
        </div>

        {/* ── CTA button ────────────────────────────────────────────── */}
        <div className="mt-6 lg:mt-8 w-full max-w-sm lg:max-w-md">
          <button
            onClick={next}
            className="w-full py-3.5 rounded-2xl bg-primary text-white font-semibold text-base shadow-md hover:bg-primary-hover active:scale-[0.98] transition-all"
          >
            {isLast ? t('onboarding.getStarted') : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
