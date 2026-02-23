export interface SearchLocation {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
}

const STORAGE_KEY = 'search_history';
const MAX_ITEMS = 10;

export function getSearchHistory(): SearchLocation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SearchLocation[];
  } catch {
    return [];
  }
}

export function addSearchHistory(item: SearchLocation): void {
  const history = getSearchHistory().filter((h) => h.placeId !== item.placeId);
  history.unshift(item);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_ITEMS)));
}

export function clearSearchHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
