import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useHead } from '@/lib/hooks/useHead';
import { useI18n } from '@/app/providers';
import * as api from '@/lib/api/client';

interface CityMetrics {
  count: number;
  checkins_30d?: number;
  popularity_label?: string | null;
}

const RELIGIONS = [
  { value: '', label: 'All' },
  { value: 'islam', label: 'Islam' },
  { value: 'christianity', label: 'Christianity' },
  { value: 'hinduism', label: 'Hinduism' },
  { value: 'buddhism', label: 'Buddhism' },
  { value: 'sikhism', label: 'Sikhism' },
  { value: 'judaism', label: 'Judaism' },
  { value: 'bahai', label: "Bahá'í" },
  { value: 'zoroastrianism', label: 'Zoroastrianism' },
];

interface CityPlace {
  place_code: string;
  name: string;
  religion: string;
  address: string;
  seo_slug?: string;
}

const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function getCityMetrics(citySlug: string): Promise<CityMetrics | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/cities?include_metrics=true&limit=200`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    const cities: Array<{
      city_slug: string;
      count: number;
      checkins_30d?: number;
      popularity_label?: string | null;
    }> = data.cities ?? [];
    const match = cities.find((c) => c.city_slug === citySlug);
    if (!match) return null;
    return {
      count: match.count,
      checkins_30d: match.checkins_30d,
      popularity_label: match.popularity_label,
    };
  } catch {
    return null;
  }
}

function PopularityBadge({ label }: { label: string }) {
  const cls =
    label === 'Trending'
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
      : label === 'Popular'
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
        : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}
    >
      {label === 'Trending' && (
        <span className="material-symbols-outlined text-[14px]" aria-hidden>
          local_fire_department
        </span>
      )}
      {label === 'Popular' && (
        <span className="material-symbols-outlined text-[14px]" aria-hidden>
          star
        </span>
      )}
      {label === 'Growing' && (
        <span className="material-symbols-outlined text-[14px]" aria-hidden>
          trending_up
        </span>
      )}
      {label}
    </span>
  );
}

export default function ExploreCity() {
  const { t } = useI18n();
  const { city } = useParams<{ city: string }>();
  const [places, setPlaces] = useState<CityPlace[]>([]);
  const [cityName, setCityName] = useState('');
  const [loading, setLoading] = useState(true);
  const [religion, setReligion] = useState('');
  const [metrics, setMetrics] = useState<CityMetrics | null>(null);

  useHead({
    title: cityName ? `Sacred Sites in ${cityName}` : 'Explore City',
    description: cityName
      ? `Discover sacred sites, mosques, temples, and churches in ${cityName}.`
      : undefined,
    canonicalUrl: city ? `https://soul-step.org/explore/${city}` : undefined,
    ogType: 'website',
  });

  useEffect(() => {
    if (!city) return;
    setLoading(true);
    const fetchFn = religion ? api.getCityReligionPlaces(city, religion) : api.getCityPlaces(city);
    fetchFn
      .then((data) => {
        setPlaces(data.places ?? []);
        setCityName(data.city ?? '');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [city, religion]);

  useEffect(() => {
    if (!city) return;
    getCityMetrics(city).then(setMetrics);
  }, [city]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-4 text-sm text-text-muted dark:text-dark-text-secondary">
        <Link to="/explore" className="hover:text-primary transition-colors">
          {t('explore.allCities')}
        </Link>
        <span>/</span>
        <span className="text-text-main dark:text-white font-medium">{cityName || city}</span>
      </div>

      <h1 className="text-2xl font-bold text-text-main dark:text-white mb-2">
        {t('explore.cityTitle').replace('{city}', cityName || city || '')}
      </h1>

      {/* Metrics banner */}
      {metrics && (
        <div className="flex items-center gap-4 mb-4 p-4 rounded-2xl bg-white dark:bg-dark-surface border border-slate-100 dark:border-dark-border shadow-sm flex-wrap">
          <div className="flex flex-col">
            <span className="text-xl font-bold text-text-main dark:text-white tabular-nums">
              {metrics.count.toLocaleString()}
            </span>
            <span className="text-xs text-text-secondary dark:text-dark-text-secondary">
              {t('explore.totalSites') || 'Total sites'}
            </span>
          </div>
          {metrics.checkins_30d != null && (
            <>
              <div className="w-px h-8 bg-slate-100 dark:bg-dark-border" />
              <div className="flex flex-col">
                <span className="text-xl font-bold text-text-main dark:text-white tabular-nums">
                  {metrics.checkins_30d.toLocaleString()}
                </span>
                <span className="text-xs text-text-secondary dark:text-dark-text-secondary">
                  {t('explore.checkins30d') || 'Check-ins (30d)'}
                </span>
              </div>
            </>
          )}
          {metrics.popularity_label && (
            <>
              <div className="w-px h-8 bg-slate-100 dark:bg-dark-border" />
              <PopularityBadge label={metrics.popularity_label} />
            </>
          )}
        </div>
      )}

      <div className="flex gap-2 flex-wrap mb-6">
        {RELIGIONS.map((r) => (
          <Link
            key={r.value}
            to={r.value ? `/explore/${city}/${r.value}` : `/explore/${city}`}
            onClick={() => setReligion(r.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              religion === r.value
                ? 'bg-primary text-white'
                : 'bg-slate-100 dark:bg-dark-surface text-text-secondary dark:text-dark-text-secondary hover:bg-slate-200 dark:hover:bg-dark-border'
            }`}
          >
            {r.label}
          </Link>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="material-symbols-outlined text-3xl animate-spin text-slate-300">
            progress_activity
          </span>
        </div>
      ) : places.length === 0 ? (
        <p className="text-center text-text-muted dark:text-dark-text-secondary py-12">
          {t('explore.noSites')}
        </p>
      ) : (
        <div className="space-y-2">
          {places.map((place) => {
            const to = place.seo_slug
              ? `/places/${place.place_code}/${place.seo_slug}`
              : `/places/${place.place_code}`;
            return (
              <Link
                key={place.place_code}
                to={to}
                className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface hover:shadow-md transition-shadow group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-main dark:text-white group-hover:text-primary transition-colors truncate">
                    {place.name}
                  </p>
                  <p className="text-xs text-text-secondary dark:text-dark-text-secondary truncate mt-0.5">
                    {place.address}
                  </p>
                </div>
                <span className="text-xs font-medium text-text-muted dark:text-dark-text-secondary capitalize shrink-0">
                  {place.religion}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
