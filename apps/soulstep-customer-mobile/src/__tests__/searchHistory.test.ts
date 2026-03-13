import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSearchHistory, addSearchHistory, clearSearchHistory } from '../lib/utils/searchHistory';
import type { SearchLocation } from '../lib/utils/searchHistory';

function makeLoc(n: number): SearchLocation {
  return { placeId: `pid_${n}`, name: `Place ${n}`, lat: n, lng: n };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('getSearchHistory', () => {
  it('returns empty array when nothing stored', async () => {
    const result = await getSearchHistory();
    expect(result).toEqual([]);
  });

  it('returns stored history', async () => {
    const item = makeLoc(1);
    await addSearchHistory(item);
    const result = await getSearchHistory();
    expect(result).toEqual([item]);
  });

  it('returns empty array when AsyncStorage throws', async () => {
    const original = AsyncStorage.getItem;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (AsyncStorage as any).getItem = jest.fn().mockRejectedValueOnce(new Error('storage error'));
    const result = await getSearchHistory();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (AsyncStorage as any).getItem = original;
    expect(result).toEqual([]);
  });
});

describe('addSearchHistory', () => {
  it('prepends new items', async () => {
    await addSearchHistory(makeLoc(1));
    await addSearchHistory(makeLoc(2));
    const history = await getSearchHistory();
    expect(history[0].placeId).toBe('pid_2');
    expect(history[1].placeId).toBe('pid_1');
  });

  it('deduplicates by placeId, moving to front', async () => {
    await addSearchHistory(makeLoc(1));
    await addSearchHistory(makeLoc(2));
    await addSearchHistory(makeLoc(1)); // re-add
    const history = await getSearchHistory();
    expect(history[0].placeId).toBe('pid_1');
    expect(history.length).toBe(2);
  });

  it('keeps max 10 items', async () => {
    for (let i = 1; i <= 12; i++) await addSearchHistory(makeLoc(i));
    const history = await getSearchHistory();
    expect(history.length).toBe(10);
  });

  it('most recent item is first', async () => {
    for (let i = 1; i <= 5; i++) await addSearchHistory(makeLoc(i));
    const history = await getSearchHistory();
    expect(history[0].placeId).toBe('pid_5');
  });
});

describe('clearSearchHistory', () => {
  it('removes all history', async () => {
    await addSearchHistory(makeLoc(1));
    await clearSearchHistory();
    const result = await getSearchHistory();
    expect(result).toEqual([]);
  });
});
