import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { DEFAULT_LAT, DEFAULT_LNG } from '@/lib/constants';

export interface LocationCoords {
  lat: number;
  lng: number;
}

interface LocationContextValue {
  coords: LocationCoords;
}

const LocationContext = createContext<LocationContextValue | null>(null);

const DEFAULT_COORDS: LocationCoords = { lat: DEFAULT_LAT, lng: DEFAULT_LNG };

export function LocationProvider({ children }: { children: ReactNode }) {
  const [coords, setCoords] = useState<LocationCoords>(DEFAULT_COORDS);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setCoords(DEFAULT_COORDS);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        setCoords(DEFAULT_COORDS);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000, // 5 min cache
      }
    );
  }, []);

  const value = useMemo(() => ({ coords }), [coords]);
  return (
    <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
  );
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within LocationProvider');
  return ctx;
}
