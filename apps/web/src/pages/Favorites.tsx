import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getMyFavorites } from '@/api/client';
import type { Place } from '@/types';

export default function Favorites() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchFavorites = useCallback(() => {
    setLoading(true);
    setError('');
    getMyFavorites()
      .then(setPlaces)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMyFavorites()
      .then((data) => { if (!cancelled) setPlaces(data); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="max-w-md mx-auto px-5 py-6 md:max-w-4xl">
      <header className="mb-6">
        <p className="text-sm text-primary font-medium uppercase tracking-wide mb-1">Saved</p>
        <h1 className="text-2xl font-semibold text-text-main">Favorites</h1>
      </header>

      {loading && <p className="text-text-muted">Loading...</p>}
      {error && (
        <div className="py-4">
          <p className="text-red-600 mb-2">{error}</p>
          <button type="button" onClick={fetchFavorites} className="text-primary font-medium">Retry</button>
        </div>
      )}
      {!loading && !error && places.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-2xl border border-gray-100">
          <span className="material-symbols-outlined text-5xl text-gray-300 mb-3">bookmark</span>
          <p className="text-text-muted mb-2">No saved places</p>
          <p className="text-sm text-text-muted mb-4">Add places from their detail screen.</p>
          <Link to="/home" className="inline-block py-2 px-4 rounded-xl bg-primary text-white text-sm font-medium">Explore places</Link>
        </div>
      )}
      {!loading && !error && places.length > 0 && (
        <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
          {places.map((place) => (
            <Link
              key={place.place_code}
              to={`/places/${place.place_code}`}
              className="block bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-200 hover:shadow-md"
            >
              <div className="h-40 bg-gray-100 flex items-center justify-center">
                {place.image_urls?.[0] ? (
                  <img src={place.image_urls[0]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined text-4xl text-gray-300">place</span>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-bold text-text-main">{place.name}</h3>
                <p className="text-sm text-text-muted">{place.address}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
