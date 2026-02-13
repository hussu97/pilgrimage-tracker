import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEME_STORAGE_KEY } from './constants';

export type Theme = 'light' | 'dark' | 'system';

export async function getStoredTheme(): Promise<Theme> {
  try {
    const s = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    if (s === 'light' || s === 'dark' || s === 'system') return s;
  } catch {}
  return 'system';
}

export async function setStoredTheme(theme: Theme): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}
}
