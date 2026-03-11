import { useState, useEffect, useCallback } from 'react';
import PlaceMapView from '@/components/places/PlaceMapView';
import { getPlaces } from '@/lib/api/client';
import type { Place } from '@/lib/types';
import type { Religion } from '@/lib/types/users';
import { useI18n } from '@/app/providers';
import { useLocation } from '@/app/contexts/LocationContext';
import { useHead } from '@/lib/hooks/useHead';

const RELIGION_OPTIONS: { value: string; label: string; icon: string }[] = [
  { value: '', label: 'All', icon: 'public' },
  { value: 'islam', label: 'Islam', icon: 'crescent_moon' },
  { value: 'christianity', label: 'Christianity', icon: 'church' },
  { value: 'hinduism', label: 'Hinduism', icon: 'temple_hindu' },
  { value: 'buddhism', label: 'Buddhism', icon: 'brightness_7' },
  { value: 'sikhism', label: 'Sikhism', icon: 'star' },
  { value: 'judaism', label: 'Judaism', icon: 'star_of_david' },
];

export default function MapDiscovery() {
  const { t } = useI18n();
  const { coords } = useLocation();

  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [search, setSearch] = useState('');
  const [religion, setReligion] = useState('');
  const [loading, setLoading] = useState(false);

  useHead({ title: t('map.fullScreen') || 'Explore Map' });

  const fetchPlaces = useCallback(async (searchVal: string, religionVal: string) => {
    setLoading(true);
    try {
      const resp = await getPlaces({
        search: searchVal || undefined,
        religions: religionVal ? [religionVal as Religion] : undefined,
        limit: 200,
      });
      setPlaces(resp.places);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchPlaces('', '');
  }, [fetchPlaces]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPlaces(search, religion);
    }, 400);
    return () => clearTimeout(timer);
  }, [search, religion, fetchPlaces]);

  return (
    // Full-screen container: position relative so overlay children can be absolute
    <div className="fixed inset-0 z-0 w-full h-full">
      {/* Full-screen map — fills the entire viewport */}
      <PlaceMapView
        places={places}
        center={coords}
        selectedPlace={selectedPlace}
        onPlaceSelect={setSelectedPlace}
        t={t}
        isVisible
        mapLoading={loading}
      />

      {/* Floating search + filter overlay */}
      <div className="absolute top-0 left-0 right-0 z-[700] pointer-events-none">
        <div className="pointer-events-auto mx-auto max-w-lg px-4 pt-3 flex flex-col gap-2">
          {/* Search bar */}
          <div className="flex items-center gap-2 bg-white/90 dark:bg-dark-surface/90 backdrop-blur-xl rounded-2xl shadow-lg border border-input-border/60 dark:border-dark-border px-4 py-2.5">
            <span
              className="material-symbols-outlined text-[20px] text-slate-400 dark:text-dark-text-secondary shrink-0"
              aria-hidden
            >
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('search.placeholder') || 'Search sacred sites…'}
              className="flex-1 bg-transparent text-sm text-slate-700 dark:text-white placeholder:text-slate-400 dark:placeholder:text-dark-text-secondary outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="shrink-0 p-0.5 rounded-full hover:bg-slate-100 dark:hover:bg-dark-border transition-colors"
                aria-label="Clear search"
              >
                <span className="material-symbols-outlined text-[16px] text-slate-400 dark:text-dark-text-secondary">
                  close
                </span>
              </button>
            )}
          </div>

          {/* Religion filter chips */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {RELIGION_OPTIONS.map((opt) => {
              const isActive = religion === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setReligion(opt.value)}
                  className={[
                    'shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150',
                    isActive
                      ? 'bg-primary text-white shadow-md shadow-primary/30'
                      : 'bg-white/85 dark:bg-dark-surface/85 backdrop-blur text-slate-600 dark:text-dark-text-secondary border border-input-border/50 dark:border-dark-border hover:bg-white dark:hover:bg-dark-surface',
                  ].join(' ')}
                >
                  <span
                    className="material-symbols-outlined text-[14px]"
                    aria-hidden
                    style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    {opt.icon}
                  </span>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
