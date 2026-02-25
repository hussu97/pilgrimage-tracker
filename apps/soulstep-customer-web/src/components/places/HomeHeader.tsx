import { cn } from '@/lib/utils/cn';
import type { SearchLocation } from '@/lib/utils/searchHistory';

interface HomeHeaderProps {
  displayName: string;
  viewMode: 'list' | 'map';
  searchLocation: SearchLocation | null;
  activeFiltersCount: number;
  onSearchClick: () => void;
  onClearSearch: () => void;
  onViewModeToggle: () => void;
  onFilterClick: () => void;
  t: (key: string) => string;
}

export default function HomeHeader({
  displayName,
  viewMode,
  searchLocation,
  activeFiltersCount,
  onSearchClick,
  onClearSearch,
  onViewModeToggle,
  onFilterClick,
  t,
}: HomeHeaderProps) {
  return (
    <header className="sticky top-0 z-[100] bg-white/80 dark:bg-dark-bg/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-dark-border px-4 py-6 sm:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight leading-tight">
              {t('home.greeting')} <span className="text-primary">{displayName}</span>
            </h1>
          </div>
          <button
            onClick={onViewModeToggle}
            className="group flex items-center gap-2 bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border rounded-2xl px-5 py-2.5 shadow-soft hover:shadow-md transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[20px] text-slate-600 dark:text-slate-300">
              {viewMode === 'list' ? 'map' : 'grid_view'}
            </span>
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200 hidden sm:inline">
              {viewMode === 'list' ? t('home.map') : t('home.listView')}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-4">
          {/* Search bar — always a clickable button that opens overlay */}
          <button
            onClick={onSearchClick}
            className="flex-1 flex items-center gap-3 bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border rounded-2xl px-5 py-4 transition-all duration-300 shadow-sm hover:shadow-md text-left"
          >
            <span className="material-symbols-outlined text-slate-400 text-xl">search</span>
            {searchLocation ? (
              <span className="flex-1 text-base font-medium text-slate-800 dark:text-white truncate">
                {searchLocation.name}
              </span>
            ) : (
              <span className="flex-1 text-base font-medium text-slate-300 truncate">
                {t('search.searchPlaces')}
              </span>
            )}
            {searchLocation && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClearSearch();
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            )}
          </button>

          <button
            onClick={onFilterClick}
            className={cn(
              'relative min-w-[56px] h-[56px] flex items-center justify-center rounded-2xl border transition-all duration-300',
              activeFiltersCount > 0
                ? 'bg-primary border-primary text-white shadow-xl shadow-primary/20'
                : 'bg-white dark:bg-dark-surface border-slate-200 dark:border-dark-border text-slate-500 hover:text-primary shadow-sm hover:border-primary',
            )}
          >
            <span className="material-symbols-outlined text-xl">tune</span>
            {activeFiltersCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center ring-2 ring-white dark:ring-dark-bg">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
