import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useHead } from '@/lib/hooks/useHead';
import { useI18n } from '@/app/providers';
import * as api from '@/lib/api/client';
import PlaceCardUnified from '@/components/places/PlaceCardUnified';
import type { Place } from '@/lib/types';

interface CityMetrics {
  count: number;
  checkins_30d?: number;
  popularity_label?: string | null;
}

interface CityPlace {
  place_code: string;
  name: string;
  religion: string;
  address: string;
  seo_slug?: string;
  images?: { url: string }[];
}

const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function getCityMetrics(citySlug: string): Promise<CityMetrics | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/cities?include_metrics=true&page_size=200`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    const cities: Array<{
      city_slug: string;
      count: number;
      checkins_30d?: number;
      popularity_label?: string | null;
    }> = data.items ?? [];
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
    api
      .getCityPlaces(city)
      .then((data) => {
        setPlaces(data.items ?? []);
        setCityName(data.city ?? '');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [city]);

  useEffect(() => {
    if (!city) return;
    getCityMetrics(city).then(setMetrics);
  }, [city]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-4 text-sm text-text-muted dark:text-dark-text-secondary">
        <Link to="/explore" className="hover:text-primary transition-colors">
          {t('explore.allCities')}
        </Link>
        <span>/</span>
        <span className="text-text-main dark:text-white font-medium">{cityName || city}</span>
      </div>

      <h1 className="text-2xl lg:text-3xl font-bold text-text-main dark:text-white mb-2">
        {t('explore.cityTitle').replace('{city}', cityName || city || '')}
      </h1>

      {/* Metrics banner */}
      {metrics && (
        <div className="flex items-center gap-4 mb-6 p-4 rounded-2xl bg-white dark:bg-dark-surface border border-slate-100 dark:border-dark-border shadow-sm flex-wrap">
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {places.map((place) => {
            const placeObj = {
              place_code: place.place_code,
              name: place.name,
              address: place.address,
              images: place.images ?? [],
            } as unknown as Place;
            return <PlaceCardUnified key={place.place_code} place={placeObj} t={t} />;
          })}
        </div>
      )}
    </div>
  );
}
