import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { refreshToken, logoutServer, updateGroup } from '@/lib/api/client';

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

// ─── refreshToken ─────────────────────────────────────────────────────────────

describe('refreshToken()', () => {
  it('calls POST /api/v1/auth/refresh with credentials include', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ token: 'new-access-token' }));

    const result = await refreshToken();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/refresh'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    expect(result.token).toBe('new-access-token');
  });

  it('throws when the response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({}, 401));

    await expect(refreshToken()).rejects.toThrow('Token refresh failed');
  });
});

// ─── logoutServer ─────────────────────────────────────────────────────────────

describe('logoutServer()', () => {
  it('calls POST /api/v1/auth/logout with credentials include', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ ok: true }));

    await expect(logoutServer()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/logout'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('does not throw when fetch rejects (best-effort)', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    await expect(logoutServer()).resolves.toBeUndefined();
  });

  it('does not throw when server returns an error status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({}, 500));

    await expect(logoutServer()).resolves.toBeUndefined();
  });
});

// ─── updateGroup ──────────────────────────────────────────────────────────────

describe('updateGroup()', () => {
  const groupCode = 'grp_abc123';
  const updateBody = { name: 'New Name', description: 'Updated desc' };
  const returnedGroup = {
    group_code: groupCode,
    name: 'New Name',
    description: 'Updated desc',
    is_private: false,
  };

  beforeEach(() => {
    storageMock.setItem('token', 'test-token');
  });

  it('calls PATCH /api/v1/groups/{groupCode}', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(returnedGroup));

    await updateGroup(groupCode, updateBody);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v1/groups/${groupCode}`),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('returns the updated group data', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(returnedGroup));

    const result = await updateGroup(groupCode, updateBody);

    expect(result.name).toBe('New Name');
    expect(result.description).toBe('Updated desc');
    expect(result.group_code).toBe(groupCode);
  });

  it('sends an Authorization header when a token is stored', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(returnedGroup));

    await updateGroup(groupCode, updateBody);

    const calledInit = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const headers = calledInit.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-token');
  });

  it('throws with server detail message on failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ detail: 'Not an admin' }, 403));

    await expect(updateGroup(groupCode, updateBody)).rejects.toThrow('Not an admin');
  });

  it('throws with fallback message when no detail field', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({}, 500));

    await expect(updateGroup(groupCode, {})).rejects.toThrow('Failed to update group');
  });
});
