import { useState, useEffect, useRef, useCallback } from 'react';
import { searchAutocomplete, getSearchPlaceDetails } from '@/lib/api/client';
import type { SearchSuggestion } from '@/lib/api/client';
import { getSearchHistory, addSearchHistory, clearSearchHistory } from '@/lib/utils/searchHistory';
import type { SearchLocation } from '@/lib/utils/searchHistory';

interface SearchOverlayProps {
  onSelect: (location: SearchLocation) => void;
  onClose: () => void;
  userLat?: number;
  userLng?: number;
  t: (key: string) => string;
}

export default function SearchOverlay({
  onSelect,
  onClose,
  userLat,
  userLng,
  t,
}: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [history, setHistory] = useState<SearchLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setHistory(getSearchHistory());
    inputRef.current?.focus();
  }, []);

  const fetchSuggestions = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setSuggestions([]);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const data = await searchAutocomplete(q, userLat, userLng);
        setSuggestions(data.suggestions);
      } catch {
        setError(t('search.error'));
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    },
    [userLat, userLng, t],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setSuggestions([]);
      setError('');
      return;
    }
    debounceRef.current = setTimeout(() => fetchSuggestions(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchSuggestions]);

  const handleSelectSuggestion = async (suggestion: SearchSuggestion) => {
    setLoading(true);
    try {
      const details = await getSearchPlaceDetails(suggestion.place_id);
      const loc: SearchLocation = {
        placeId: details.place_id,
        name: suggestion.main_text,
        lat: details.lat,
        lng: details.lng,
      };
      addSearchHistory(loc);
      onSelect(loc);
    } catch {
      setError(t('search.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectHistory = (item: SearchLocation) => {
    addSearchHistory(item);
    onSelect(item);
  };

  const handleClearHistory = () => {
    clearSearchHistory();
    setHistory([]);
  };

  const showRecent = query.length < 2;
  const noResults = !loading && !error && query.length >= 2 && suggestions.length === 0;

  return (
    <div className="fixed inset-0 z-[200] bg-white dark:bg-dark-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-100 dark:border-dark-border">
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-dark-surface transition-colors"
        >
          <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">
            arrow_back
          </span>
        </button>

        <div className="flex-1 flex items-center gap-3 bg-slate-50 dark:bg-dark-surface border border-slate-200 dark:border-dark-border rounded-2xl px-4 py-3">
          <span className="material-symbols-outlined text-slate-400 text-xl">search</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.searchPlaces')}
            className="flex-1 bg-transparent border-none p-0 text-base font-medium text-slate-800 dark:text-white placeholder:text-slate-400 focus:ring-0 outline-none"
          />
          {query.length > 0 && (
            <button
              onClick={() => setQuery('')}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="px-4 py-6 text-center text-slate-500 dark:text-dark-text-secondary text-sm">
            {error}
          </div>
        )}

        {/* No results */}
        {!loading && noResults && (
          <div className="px-4 py-6 text-center text-slate-500 dark:text-dark-text-secondary text-sm">
            {t('search.noResults').replace('{query}', query)}
          </div>
        )}

        {/* Autocomplete suggestions */}
        {!loading && !error && suggestions.length > 0 && (
          <ul>
            {suggestions.map((s) => (
              <li key={s.place_id}>
                <button
                  onClick={() => handleSelectSuggestion(s)}
                  className="w-full flex items-center gap-4 px-4 py-4 hover:bg-slate-50 dark:hover:bg-dark-surface transition-colors text-left"
                >
                  <span className="material-symbols-outlined text-slate-400 text-xl shrink-0">
                    location_on
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-white text-sm truncate">
                      {s.main_text}
                    </p>
                    {s.secondary_text && (
                      <p className="text-xs text-slate-500 dark:text-dark-text-secondary truncate mt-0.5">
                        {s.secondary_text}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Recent searches */}
        {!loading && showRecent && (
          <div className="px-4 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-700 dark:text-white uppercase tracking-wider">
                {t('search.recentSearches')}
              </h2>
              {history.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="text-xs text-primary font-semibold hover:text-blue-700 transition-colors"
                >
                  {t('search.clearHistory')}
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-dark-text-secondary py-4">
                {t('search.recentEmpty')}
              </p>
            ) : (
              <ul>
                {history.map((item) => (
                  <li key={item.placeId}>
                    <button
                      onClick={() => handleSelectHistory(item)}
                      className="w-full flex items-center gap-4 py-3 hover:bg-slate-50 dark:hover:bg-dark-surface rounded-xl transition-colors text-left px-2 -mx-2"
                    >
                      <span className="material-symbols-outlined text-slate-400 text-xl shrink-0">
                        history
                      </span>
                      <span className="font-medium text-slate-700 dark:text-slate-200 text-sm truncate">
                        {item.name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
