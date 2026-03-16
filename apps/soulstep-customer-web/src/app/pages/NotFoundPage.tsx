import { Link } from 'react-router-dom';
import { useI18n } from '@/app/providers';
import { useHead } from '@/lib/hooks/useHead';

export default function NotFoundPage() {
  const { t } = useI18n();

  useHead({ title: '404 – Page Not Found' });

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <span className="material-symbols-outlined text-7xl text-slate-300 dark:text-dark-border mb-6">
        explore_off
      </span>
      <h1 className="text-2xl lg:text-3xl font-bold text-text-main dark:text-white mb-3">
        {t('errors.pageNotFound') || 'Page Not Found'}
      </h1>
      <p className="text-text-secondary dark:text-dark-text-secondary text-sm lg:text-base max-w-md mb-8">
        {t('errors.pageNotFoundDesc') ||
          "The page you're looking for doesn't exist or has been moved."}
      </p>
      <div className="flex gap-3 flex-wrap justify-center">
        <Link
          to="/home"
          className="px-6 py-3 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl transition-colors text-sm"
        >
          {t('nav.home') || 'Go Home'}
        </Link>
        <Link
          to="/places"
          className="px-6 py-3 border border-slate-200 dark:border-dark-border text-text-main dark:text-white font-semibold rounded-xl hover:bg-slate-50 dark:hover:bg-dark-surface transition-colors text-sm"
        >
          {t('nav.places') || 'Explore Places'}
        </Link>
      </div>
    </div>
  );
}
