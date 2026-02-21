import { useState, useCallback } from 'react';
import { useI18n } from '@/app/providers';
import { cn } from '@/lib/utils/cn';
import type { Place } from '@/lib/types';

interface PlaceSelectorProps {
  selectedCodes: string[];
  onChange: (codes: string[]) => void;
  places: Place[];
  loading?: boolean;
}

function PlaceSelector({ selectedCodes, onChange, places, loading }: PlaceSelectorProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');

  const filteredPlaces = places.filter((p) => {
    return search === '' || p.name.toLowerCase().includes(search.toLowerCase());
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
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-dark-text-secondary mb-2">
            {t('groups.placesSelected').replace('{count}', String(selectedPlaces.length))}
          </p>
          <div className="flex flex-wrap gap-2">
            {selectedPlaces.map((place, i) => (
              <div
                key={place.place_code}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 dark:bg-primary/20 border border-primary/20 dark:border-primary/30"
              >
                <span className="text-xs font-bold text-primary">{i + 1}</span>
                <span className="text-xs font-medium text-slate-700 dark:text-white">
                  {place.name}
                </span>
                <div className="flex gap-0.5 ml-1">
                  <button
                    type="button"
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="p-0.5 rounded hover:bg-primary/20 disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <span className="material-symbols-outlined text-xs text-primary">
                      arrow_upward
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(i)}
                    disabled={i === selectedPlaces.length - 1}
                    className="p-0.5 rounded hover:bg-primary/20 disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <span className="material-symbols-outlined text-xs text-primary">
                      arrow_downward
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePlace(place.place_code)}
                    className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                    aria-label="Remove"
                  >
                    <span className="material-symbols-outlined text-xs">close</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
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

      {/* Place cards */}
      {loading ? (
        <div className="flex justify-center py-8">
          <span className="material-symbols-outlined animate-spin text-primary text-3xl">
            progress_activity
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
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
                  className={cn(
                    'relative flex items-center gap-3 p-3 rounded-xl text-left transition-all active:scale-[0.98]',
                    checked
                      ? 'border-2 border-primary bg-primary/5 dark:bg-primary/10'
                      : 'border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface hover:border-slate-300 dark:hover:border-dark-border',
                  )}
                >
                  {/* Place image */}
                  <div className="w-14 h-14 rounded-lg bg-slate-100 dark:bg-dark-border flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {place.images?.[0]?.url ? (
                      <img
                        src={place.images[0].url}
                        alt={place.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="material-symbols-outlined text-slate-400 dark:text-dark-text-secondary">
                        mosque
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-white truncate">
                      {place.name}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-dark-text-secondary truncate">
                      {place.address}
                    </p>
                  </div>
                  {checked && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <span className="material-symbols-outlined text-white text-xs">check</span>
                    </div>
                  )}
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
