import { useState, useCallback } from 'react';
import { useI18n } from '@/app/providers';
import type { Place } from '@/lib/types';

interface PlaceSelectorProps {
  selectedCodes: string[];
  onChange: (codes: string[]) => void;
  places: Place[];
  loading?: boolean;
}

const RELIGION_FILTERS = ['all', 'islam', 'hinduism', 'christianity'] as const;

function PlaceSelector({ selectedCodes, onChange, places, loading }: PlaceSelectorProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [religionFilter, setReligionFilter] = useState<string>('all');

  const filteredPlaces = places.filter((p) => {
    const matchesSearch = search === '' || p.name.toLowerCase().includes(search.toLowerCase());
    const matchesReligion = religionFilter === 'all' || p.religion === religionFilter;
    return matchesSearch && matchesReligion;
  });

  const togglePlace = useCallback(
    (code: string) => {
      if (selectedCodes.includes(code)) {
        onChange(selectedCodes.filter((c) => c !== code));
      } else {
        onChange([...selectedCodes, code]);
      }
    },
    [selectedCodes, onChange],
  );

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...selectedCodes];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };

  const moveDown = (index: number) => {
    if (index === selectedCodes.length - 1) return;
    const next = [...selectedCodes];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  };

  const selectedPlaces = selectedCodes
    .map((code) => places.find((p) => p.place_code === code))
    .filter(Boolean) as Place[];

  return (
    <div className="flex flex-col gap-4">
      {/* Selected places (ordered) */}
      {selectedPlaces.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface p-3">
          <p className="text-xs font-semibold text-slate-500 dark:text-dark-text-secondary mb-2">
            {t('groups.placesSelected').replace('{count}', String(selectedPlaces.length))}
          </p>
          <ol className="flex flex-col gap-1">
            {selectedPlaces.map((place, i) => (
              <li
                key={place.place_code}
                className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-primary/5 dark:bg-primary/10"
              >
                <span className="text-xs font-bold text-primary w-5 text-center">{i + 1}</span>
                <span className="flex-1 text-sm font-medium text-slate-700 dark:text-white truncate">
                  {place.name}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-dark-border disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_upward</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(i)}
                    disabled={i === selectedPlaces.length - 1}
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-dark-border disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_downward</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePlace(place.place_code)}
                    className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"
                    aria-label="Remove"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Search + religion filter */}
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
          search
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('groups.searchPlaces')}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface text-sm text-slate-700 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {RELIGION_FILTERS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReligionFilter(r)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              religionFilter === r
                ? 'bg-primary text-white border-primary'
                : 'bg-white dark:bg-dark-surface border-slate-200 dark:border-dark-border text-slate-500 hover:border-primary hover:text-primary'
            }`}
          >
            {r === 'all' ? t('common.allReligions') : t(`common.${r}`)}
          </button>
        ))}
      </div>

      {/* Place list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <span className="material-symbols-outlined animate-spin text-primary text-3xl">
            progress_activity
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
          {filteredPlaces.length === 0 ? (
            <p className="text-center text-sm text-slate-400 dark:text-dark-text-secondary py-6">
              {t('home.noPlacesFound')}
            </p>
          ) : (
            filteredPlaces.map((place) => {
              const checked = selectedCodes.includes(place.place_code);
              return (
                <button
                  key={place.place_code}
                  type="button"
                  onClick={() => togglePlace(place.place_code)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                    checked
                      ? 'bg-primary/10 dark:bg-primary/20'
                      : 'hover:bg-slate-50 dark:hover:bg-dark-border'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      checked
                        ? 'bg-primary border-primary'
                        : 'border-slate-300 dark:border-dark-border'
                    }`}
                  >
                    {checked && (
                      <span className="material-symbols-outlined text-white text-xs">check</span>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-white truncate">
                      {place.name}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-dark-text-secondary truncate">
                      {place.religion} · {place.address}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default PlaceSelector;
