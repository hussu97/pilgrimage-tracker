/**
 * ConsentBanner — GDPR/CCPA consent bottom sheet.
 *
 * Shown on first visit when ads are enabled and consent hasn't been given.
 * "Accept All" grants both ads + analytics consent. "Manage Preferences"
 * reveals individual toggles.
 */

import { useState } from 'react';
import { useAds } from '@/components/ads/AdProvider';
import { useI18n } from '@/app/providers';

export default function ConsentBanner() {
  const { showConsentBanner, acceptAll, dismissConsentBanner, consent, setConsent } = useAds();
  const { t } = useI18n();
  const [showPreferences, setShowPreferences] = useState(false);
  const [adsChecked, setAdsChecked] = useState(consent.ads ?? true);
  const [analyticsChecked, setAnalyticsChecked] = useState(consent.analytics ?? true);

  if (!showConsentBanner) return null;

  const handleAcceptAll = () => {
    acceptAll();
    dismissConsentBanner();
  };

  const handleSave = () => {
    setConsent('ads', adsChecked);
    setConsent('analytics', analyticsChecked);
    dismissConsentBanner();
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-lg bg-white dark:bg-dark-surface rounded-2xl shadow-xl border border-slate-200 dark:border-dark-border p-5">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
          {t('consent.title')}
        </h3>
        <p className="text-sm text-slate-600 dark:text-dark-text-secondary mb-4 leading-relaxed">
          {t('consent.body')}
        </p>

        {showPreferences && (
          <div className="space-y-3 mb-4">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-slate-700 dark:text-slate-300">
                {t('consent.personalizedAds')}
              </span>
              <input
                type="checkbox"
                checked={adsChecked}
                onChange={(e) => setAdsChecked(e.target.checked)}
                className="w-5 h-5 rounded accent-primary"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-slate-700 dark:text-slate-300">
                {t('consent.analytics')}
              </span>
              <input
                type="checkbox"
                checked={analyticsChecked}
                onChange={(e) => setAnalyticsChecked(e.target.checked)}
                className="w-5 h-5 rounded accent-primary"
              />
            </label>
          </div>
        )}

        <div className="flex gap-3">
          {showPreferences ? (
            <button
              onClick={handleSave}
              className="flex-1 py-2.5 px-4 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {t('consent.save')}
            </button>
          ) : (
            <>
              <button
                onClick={handleAcceptAll}
                className="flex-1 py-2.5 px-4 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                {t('consent.acceptAll')}
              </button>
              <button
                onClick={() => setShowPreferences(true)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-dark-border text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-dark-border/80 transition-colors"
              >
                {t('consent.managePreferences')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
