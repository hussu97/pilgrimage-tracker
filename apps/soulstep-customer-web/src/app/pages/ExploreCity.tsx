import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useHead } from '@/lib/hooks/useHead';
import * as api from '@/lib/api/client';

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

export default function ExploreCity() {
  const { city } = useParams<{ city: string }>();
  const [places, setPlaces] = useState<CityPlace[]>([]);
  const [cityName, setCityName] = useState('');
  const [loading, setLoading] = useState(true);
  const [religion, setReligion] = useState('');

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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-4 text-sm text-text-muted dark:text-dark-text-secondary">
        <Link to="/explore" className="hover:text-primary transition-colors">
          All Cities
        </Link>
        <span>/</span>
        <span className="text-text-main dark:text-white font-medium">{cityName || city}</span>
      </div>

      <h1 className="text-2xl font-bold text-text-main dark:text-white mb-2">
        Sacred Sites in {cityName || city}
      </h1>

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
          No sacred sites found.
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
