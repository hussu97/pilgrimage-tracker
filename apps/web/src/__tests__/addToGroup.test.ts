import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── localStorage mock ────────────────────────────────────────────────────────
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

Object.defineProperty(window, 'localStorage', { value: storageMock, writable: true });

import { addPlaceToGroup } from '@/lib/api/client';

function mockResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
  } as unknown as Response;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  storageMock.clear();
});

describe('addPlaceToGroup()', () => {
  it('calls POST /api/v1/groups/:groupCode/places/:placeCode', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ ok: true, already_exists: false }));

    const result = await addPlaceToGroup('grp_abc', 'plc_xyz');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/groups/grp_abc/places/plc_xyz'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.ok).toBe(true);
    expect(result.already_exists).toBe(false);
  });

  it('returns already_exists=true when place is already in the group', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ ok: true, already_exists: true }));

    const result = await addPlaceToGroup('grp_abc', 'plc_xyz');

    expect(result.already_exists).toBe(true);
  });

  it('throws when the server returns an error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ detail: 'Not a member' }, 403));

    await expect(addPlaceToGroup('grp_abc', 'plc_xyz')).rejects.toThrow('Not a member');
  });

  it('throws a generic message when detail is missing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({}, 500));

    await expect(addPlaceToGroup('grp_abc', 'plc_xyz')).rejects.toThrow(
      'Failed to add place to group',
    );
  });
});
