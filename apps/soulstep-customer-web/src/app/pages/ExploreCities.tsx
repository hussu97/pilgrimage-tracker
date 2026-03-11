import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useHead } from '@/lib/hooks/useHead';
import * as api from '@/lib/api/client';

interface City {
  city: string;
  city_slug: string;
  count: number;
}

export default function ExploreCities() {
  useHead({
    title: 'Explore Sacred Sites by City',
    description:
      'Discover sacred sites in cities around the world. Find mosques, temples, churches, and more by city.',
    canonicalUrl: 'https://soul-step.org/explore',
    ogType: 'website',
    ogTitle: 'Explore Sacred Sites by City | SoulStep',
    ogUrl: 'https://soul-step.org/explore',
    twitterCard: 'summary',
  });

  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api
      .getCities()
      .then((data) => {
        setCities(data.cities ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = cities.filter((c) => c.city.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-text-main dark:text-white mb-2">Explore by City</h1>
      <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-6">
        Find sacred sites in cities around the world.
      </p>

      <input
        type="search"
        placeholder="Search cities..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-2.5 rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface text-sm text-text-main dark:text-white placeholder-text-muted dark:placeholder-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-primary mb-6"
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="material-symbols-outlined text-3xl animate-spin text-slate-300">
            progress_activity
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((city) => (
            <Link
              key={city.city_slug}
              to={`/explore/${city.city_slug}`}
              className="rounded-xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-4 hover:shadow-md hover:border-primary/20 transition-all group"
            >
              <p className="text-sm font-semibold text-text-main dark:text-white group-hover:text-primary transition-colors truncate">
                {city.city}
              </p>
              <p className="text-xs text-text-muted dark:text-dark-text-secondary mt-1">
                {city.count} {city.count === 1 ? 'site' : 'sites'}
              </p>
            </Link>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <p className="text-center text-text-muted dark:text-dark-text-secondary py-8">
          No cities found.
        </p>
      )}
    </div>
  );
}
