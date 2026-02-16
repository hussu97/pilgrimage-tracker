import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import * as Location from 'expo-location';
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
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') {
          setCoords(DEFAULT_COORDS);
          return;
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      } catch {
        if (!cancelled) setCoords(DEFAULT_COORDS);
      }
    })();
    return () => {
      cancelled = true;
    };
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
