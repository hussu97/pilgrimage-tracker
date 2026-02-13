import { useEffect, useState, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getPlaces } from '@/api/client';
import type { Place } from '@/types';

const DEFAULT_LAT = 40.71;
const DEFAULT_LNG = -74.01;

function SimpleMap({
  places,
  selectedPlace,
  onSelectPlace,
  centerLat,
  centerLng,
}: {
  places: Place[];
  selectedPlace: Place | null;
  onSelectPlace: (p: Place | null) => void;
  centerLat: number;
  centerLng: number;
}) {
  const padding = 0.05;
  const lats = places.map((p) => p.lat);
  const lngs = places.map((p) => p.lng);
  const minLat = Math.min(...lats, centerLat) - padding;
  const maxLat = Math.max(...lats, centerLat) + padding;
  const minLng = Math.min(...lngs, centerLng) - padding;
  const maxLng = Math.max(...lngs, centerLng) + padding;
  const toX = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * 100;
  const toY = (lat: number) => 100 - ((lat - minLat) / (maxLat - minLat)) * 100;

  return (
    <div className="w-full h-full relative">
      {places.map((place) => (
        <button
          key={place.place_code}
          type="button"
          onClick={() => onSelectPlace(selectedPlace?.place_code === place.place_code ? null : place)}
          className={`absolute w-8 h-8 -ml-4 -mt-4 rounded-full flex items-center justify-center shadow ${
            selectedPlace?.place_code === place.place_code ? 'bg-primary text-white ring-2 ring-primary ring-offset-2' : 'bg-white text-primary border-2 border-primary'
          }`}
          style={{ left: `${toX(place.lng)}%`, top: `${toY(place.lat)}%` }}
          aria-label={`${place.name}, view details`}
        >
          <span className="material-icons text-lg">place</span>
        </button>
      ))}
    </div>
  );
}

const FILTER_CHIPS = [
  { id: '', label: 'Nearby' },
  { id: 'mosque', label: 'Mosque' },
  { id: 'temple', label: 'Temple' },
  { id: 'church', label: 'Church' },
];

export default function Home() {
  const { user, logout } = useAuth();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [placeTypeFilter, setPlaceTypeFilter] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  const fetchPlaces = useCallback(() => {
    if (!user?.religion) return;
    setLoading(true);
    setError('');
    getPlaces({
      religion: user.religion,
      lat: DEFAULT_LAT,
      lng: DEFAULT_LNG,
      search: searchQuery || undefined,
      place_type: placeTypeFilter || undefined,
      radius: 100,
    })
      .then(setPlaces)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load places'))
      .finally(() => setLoading(false));
  }, [user?.religion, searchQuery, placeTypeFilter]);

  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    if (!user?.religion) return;
    setLoading(true);
    setError('');
    getPlaces({
      religion: user.religion,
      lat: DEFAULT_LAT,
      lng: DEFAULT_LNG,
      search: searchQuery || undefined,
      place_type: placeTypeFilter || undefined,
      radius: 100,
    })
      .then((data) => { if (!cancelled) setPlaces(data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load places'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.religion, searchQuery, placeTypeFilter]);

  if (!user) return null;
  if (!user.religion) {
    return <Navigate to="/select-path" replace />;
  }

  const greeting = user.religion === 'islam' ? 'Assalamu Alaikum' : 'Welcome';

  return (
    <div className="max-w-md mx-auto px-5 py-6 md:max-w-4xl">
      <header className="mb-6">
        <p className="text-sm text-primary font-medium uppercase tracking-wide mb-1">Explore</p>
        <h1 className="text-2xl font-semibold text-text-main">
          {greeting},<br />{user.display_name}
        </h1>
      </header>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setViewMode('list')}
          className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-1 ${viewMode === 'list' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          <span className="material-symbols-outlined text-lg">list</span>
          List
        </button>
        <button
          type="button"
          onClick={() => setViewMode('map')}
          className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-1 ${viewMode === 'map' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          <span className="material-symbols-outlined text-lg">map</span>
          Map
        </button>
      </div>

      <div className="relative mb-4">
        <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden>search</span>
        <input
          type="search"
          placeholder="Find a place..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-input-border rounded-xl text-sm"
          aria-label="Search places"
        />
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 mb-4">
        {FILTER_CHIPS.map((chip) => (
          <button
            key={chip.id || 'all'}
            type="button"
            onClick={() => setPlaceTypeFilter(chip.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${placeTypeFilter === chip.id ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {viewMode === 'list' && (
        <>
          {loading && <p className="text-text-muted py-8">Loading places...</p>}
          {error && (
            <div className="py-4">
              <p className="text-red-600 mb-2">{error}</p>
              <button type="button" onClick={fetchPlaces} className="text-primary font-medium">Retry</button>
            </div>
          )}
          {!loading && !error && places.length === 0 && (
            <div className="text-center py-12 bg-gray-50 rounded-2xl border border-gray-100">
              <span className="material-symbols-outlined text-5xl text-gray-300 mb-3">explore</span>
              <p className="text-text-muted mb-2">No places found</p>
              <p className="text-sm text-text-muted mb-4">Try a different search or filter.</p>
              <button type="button" onClick={() => { setSearchInput(''); setPlaceTypeFilter(''); }} className="text-primary font-medium">Clear filters</button>
            </div>
          )}
          {!loading && !error && places.length > 0 && (
            <div className="space-y-6 md:grid md:grid-cols-2 md:gap-6 md:space-y-0">
              {places.map((place) => (
                <Link
                  key={place.place_code}
                  to={`/places/${place.place_code}`}
                  className="block bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
                >
                  <div className="h-48 bg-gray-100 flex items-center justify-center">
                    {place.image_urls?.[0] ? (
                      <img src={place.image_urls[0]} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="material-symbols-outlined text-4xl text-gray-300">place</span>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="text-lg font-bold text-text-main">{place.name}</h3>
                        <p className="text-sm text-text-muted flex items-center mt-1">
                          <span className="material-icons text-primary text-sm mr-1">location_on</span>
                          {place.address}
                        </p>
                      </div>
                      {place.distance != null && (
                        <span className="text-xs font-bold text-gray-600 bg-gray-50 px-2 py-1 rounded-lg">{place.distance} km</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                      <span className="text-xs font-medium text-primary uppercase">View Details</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {viewMode === 'map' && (
        <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
          <div className="h-80 relative">
            {places.length === 0 && !loading && (
              <div className="absolute inset-0 flex items-center justify-center text-text-muted">No places to show on map</div>
            )}
            {places.length > 0 && (
              <SimpleMap
                places={places}
                selectedPlace={selectedPlace}
                onSelectPlace={setSelectedPlace}
                centerLat={DEFAULT_LAT}
                centerLng={DEFAULT_LNG}
              />
            )}
          </div>
          {selectedPlace && (
            <div className="p-3 bg-white border-t border-gray-200 flex items-center justify-between">
              <div>
                <p className="font-medium text-text-main">{selectedPlace.name}</p>
                <p className="text-xs text-text-muted">{selectedPlace.distance != null ? `${selectedPlace.distance} km` : selectedPlace.address}</p>
              </div>
              <Link to={`/places/${selectedPlace.place_code}`} className="py-2 px-4 rounded-xl bg-primary text-white text-sm font-medium">View details</Link>
            </div>
          )}
        </div>
      )}

      <p className="mt-8 text-sm text-text-muted">
        <button type="button" onClick={() => logout()} className="text-primary">Log out</button>
      </p>
    </div>
  );
}
