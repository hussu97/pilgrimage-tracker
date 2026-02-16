interface HomeHeaderProps {
  displayName: string;
  viewMode: 'list' | 'map';
  search: string;
  activeFiltersCount: number;
  onSearchChange: (value: string) => void;
  onViewModeToggle: () => void;
  onFilterClick: () => void;
  t: (key: string) => string;
}

export default function HomeHeader({
  displayName,
  viewMode,
  search,
  activeFiltersCount,
  onSearchChange,
  onViewModeToggle,
  onFilterClick,
  t,
}: HomeHeaderProps) {
  return (
    <header className="sticky top-0 z-[100] bg-white/80 dark:bg-dark-surface/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-dark-border px-4 py-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight leading-none">
              {t('home.greeting')} <span className="text-primary">{displayName}</span>
            </h1>
          </div>
          <button
            onClick={onViewModeToggle}
            className="group flex items-center gap-2 bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border rounded-2xl px-4 py-2 shadow-soft hover:shadow-md transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[20px] text-slate-600 dark:text-slate-300">
              {viewMode === 'list' ? 'map' : 'grid_view'}
            </span>
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200 hidden sm:inline">
              {viewMode === 'list' ? t('home.map') : 'List View'}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-3 bg-slate-100 dark:bg-dark-bg border border-transparent focus-within:border-primary/30 focus-within:bg-white dark:focus-within:bg-dark-surface focus-within:shadow-lg focus-within:shadow-primary/5 rounded-2xl px-4 py-3 transition-all duration-300">
            <span className="material-symbols-outlined text-slate-400 text-[20px]">search</span>
            <input
              type="search"
              placeholder={t('home.findPlace')}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="flex-1 bg-transparent border-none p-0 text-[15px] font-medium text-slate-800 dark:text-white placeholder:text-slate-400 focus:ring-0"
            />
          </div>
          <button
            onClick={onFilterClick}
            className={`relative h-[48px] px-4 flex items-center justify-center rounded-2xl border transition-all duration-300 ${activeFiltersCount > 0
              ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20'
              : 'bg-white dark:bg-dark-surface border-slate-200 dark:border-dark-border text-slate-500 hover:text-primary'
              }`}
          >
            <span className="material-symbols-outlined text-[20px]">tune</span>
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
