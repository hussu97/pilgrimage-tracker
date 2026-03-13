import { describe, it, expect, beforeEach, vi } from 'vitest';

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

// ─── matchMedia mock (must be done before importing theme) ────────────────────
const mockMatchMediaMatches = { value: false };

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: mockMatchMediaMatches.value,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

import { applyTheme, getStoredTheme, initTheme } from '@/lib/theme';
import { THEME_STORAGE_KEY } from '@/lib/constants';

function resetStorage() {
  storageMock.clear();
}

describe('applyTheme()', () => {
  beforeEach(() => {
    resetStorage();
    document.documentElement.classList.remove('dark');
    mockMatchMediaMatches.value = false; // default: light system preference
  });

  it("adds .dark class when theme is 'dark'", () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it("removes .dark class when theme is 'light'", () => {
    document.documentElement.classList.add('dark');
    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it("follows system preference for 'system' theme — dark system", () => {
    mockMatchMediaMatches.value = true; // system is dark
    applyTheme('system');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it("follows system preference for 'system' theme — light system", () => {
    mockMatchMediaMatches.value = false; // system is light
    applyTheme('system');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('persists the theme value to localStorage', () => {
    applyTheme('dark');
    expect(storageMock.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('persists light theme to localStorage', () => {
    applyTheme('light');
    expect(storageMock.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('persists system theme to localStorage', () => {
    applyTheme('system');
    expect(storageMock.getItem(THEME_STORAGE_KEY)).toBe('system');
  });
});

describe('initTheme()', () => {
  beforeEach(() => {
    resetStorage();
    document.documentElement.classList.remove('dark');
    mockMatchMediaMatches.value = false;
  });

  it('applies dark theme when dark is stored', () => {
    storageMock.setItem(THEME_STORAGE_KEY, 'dark');
    initTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('applies light theme when light is stored', () => {
    storageMock.setItem(THEME_STORAGE_KEY, 'light');
    initTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('registers a matchMedia change listener', () => {
    const addEventSpy = vi.fn();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (_query: string) => ({
        matches: false,
        media: _query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: addEventSpy,
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
    initTheme();
    expect(addEventSpy).toHaveBeenCalledWith('change', expect.any(Function));
    // Restore original mock
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (_query: string) => ({
        matches: mockMatchMediaMatches.value,
        media: _query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  });

  it('change listener re-applies system theme when stored theme is system', () => {
    let capturedCallback: (() => void) | undefined;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: () => ({
        matches: false,
        addEventListener: (_event: string, cb: () => void) => {
          capturedCallback = cb;
        },
        removeEventListener: vi.fn(),
      }),
    });
    storageMock.setItem(THEME_STORAGE_KEY, 'system');
    initTheme();
    expect(capturedCallback).toBeDefined();
    capturedCallback!();
    // System theme + light preference → no dark class
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    // Restore
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (_query: string) => ({
        matches: mockMatchMediaMatches.value,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  it('change listener does nothing when stored theme is not system', () => {
    let capturedCallback: (() => void) | undefined;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: () => ({
        matches: false,
        addEventListener: (_event: string, cb: () => void) => {
          capturedCallback = cb;
        },
        removeEventListener: vi.fn(),
      }),
    });
    storageMock.setItem(THEME_STORAGE_KEY, 'dark');
    initTheme();
    capturedCallback!();
    // dark theme stored → dark class was applied by initTheme
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    // Restore
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (_query: string) => ({
        matches: mockMatchMediaMatches.value,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });
});

describe('getStoredTheme()', () => {
  beforeEach(() => {
    resetStorage();
  });

  it("returns 'light' when stored value is 'light'", () => {
    storageMock.setItem(THEME_STORAGE_KEY, 'light');
    expect(getStoredTheme()).toBe('light');
  });

  it("returns 'dark' when stored value is 'dark'", () => {
    storageMock.setItem(THEME_STORAGE_KEY, 'dark');
    expect(getStoredTheme()).toBe('dark');
  });

  it("returns 'system' when stored value is 'system'", () => {
    storageMock.setItem(THEME_STORAGE_KEY, 'system');
    expect(getStoredTheme()).toBe('system');
  });

  it("falls back to 'system' when nothing is stored", () => {
    expect(getStoredTheme()).toBe('system');
  });

  it("falls back to 'system' for an invalid stored value", () => {
    storageMock.setItem(THEME_STORAGE_KEY, 'invalid-value');
    expect(getStoredTheme()).toBe('system');
  });
});
