import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SearchLocation {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
}

const STORAGE_KEY = 'search_history';
const MAX_ITEMS = 10;

export async function getSearchHistory(): Promise<SearchLocation[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SearchLocation[];
  } catch {
    return [];
  }
}

export async function addSearchHistory(item: SearchLocation): Promise<void> {
  const history = await getSearchHistory();
  const deduped = history.filter((h) => h.placeId !== item.placeId);
  deduped.unshift(item);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(deduped.slice(0, MAX_ITEMS)));
}

export async function clearSearchHistory(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
