import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStoredTheme, setStoredTheme } from '../lib/theme';
import { THEME_STORAGE_KEY } from '../lib/constants';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('getStoredTheme()', () => {
  it("returns 'system' when nothing is stored", async () => {
    const result = await getStoredTheme();
    expect(result).toBe('system');
  });

  it("returns 'light' when stored value is 'light'", async () => {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, 'light');
    const result = await getStoredTheme();
    expect(result).toBe('light');
  });

  it("returns 'dark' when stored value is 'dark'", async () => {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const result = await getStoredTheme();
    expect(result).toBe('dark');
  });

  it("returns 'system' when stored value is 'system'", async () => {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, 'system');
    const result = await getStoredTheme();
    expect(result).toBe('system');
  });

  it("falls back to 'system' for an unrecognised value", async () => {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, 'invalid-theme');
    const result = await getStoredTheme();
    expect(result).toBe('system');
  });
});

describe('setStoredTheme()', () => {
  it('stores light theme', async () => {
    await setStoredTheme('light');
    const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    expect(stored).toBe('light');
  });

  it('stores dark theme', async () => {
    await setStoredTheme('dark');
    const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    expect(stored).toBe('dark');
  });

  it('stores system theme', async () => {
    await setStoredTheme('system');
    const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    expect(stored).toBe('system');
  });

  it('roundtrips: set then get returns same value', async () => {
    await setStoredTheme('dark');
    const result = await getStoredTheme();
    expect(result).toBe('dark');
  });
});
