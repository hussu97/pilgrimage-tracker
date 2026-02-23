import { describe, it, expect, beforeEach } from 'vitest';

// ─── localStorage mock (jsdom 28+ requires explicit setup) ────────────────────
const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: storageMock,
  writable: true,
});

import { getSearchHistory, addSearchHistory, clearSearchHistory } from '@/lib/utils/searchHistory';
import type { SearchLocation } from '@/lib/utils/searchHistory';

function makeLoc(n: number): SearchLocation {
  return { placeId: `pid_${n}`, name: `Place ${n}`, lat: n, lng: n };
}

beforeEach(() => {
  storageMock.clear();
});

describe('getSearchHistory', () => {
  it('returns empty array when nothing stored', () => {
    expect(getSearchHistory()).toEqual([]);
  });

  it('returns stored history', () => {
    const item = makeLoc(1);
    addSearchHistory(item);
    expect(getSearchHistory()).toEqual([item]);
  });
});

describe('addSearchHistory', () => {
  it('prepends new items', () => {
    addSearchHistory(makeLoc(1));
    addSearchHistory(makeLoc(2));
    const history = getSearchHistory();
    expect(history[0].placeId).toBe('pid_2');
    expect(history[1].placeId).toBe('pid_1');
  });

  it('deduplicates by placeId, moving to front', () => {
    addSearchHistory(makeLoc(1));
    addSearchHistory(makeLoc(2));
    addSearchHistory(makeLoc(1)); // re-add 1
    const history = getSearchHistory();
    expect(history[0].placeId).toBe('pid_1');
    expect(history.length).toBe(2);
  });

  it('keeps max 10 items', () => {
    for (let i = 1; i <= 12; i++) addSearchHistory(makeLoc(i));
    expect(getSearchHistory().length).toBe(10);
  });

  it('most recent item is first', () => {
    for (let i = 1; i <= 5; i++) addSearchHistory(makeLoc(i));
    expect(getSearchHistory()[0].placeId).toBe('pid_5');
  });
});

describe('clearSearchHistory', () => {
  it('removes all history', () => {
    addSearchHistory(makeLoc(1));
    clearSearchHistory();
    expect(getSearchHistory()).toEqual([]);
  });
});
