import AsyncStorage from '@react-native-async-storage/async-storage';
import { refreshToken, logoutServer, updateGroup } from '@/lib/api/client';

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

function mockResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(data),
  } as unknown as Response;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

// ─── refreshToken ─────────────────────────────────────────────────────────────

describe('refreshToken()', () => {
  it('calls POST /api/v1/auth/refresh with credentials include', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ token: 'new-access-token' }));

    const result = await refreshToken();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/refresh'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    expect(result.token).toBe('new-access-token');
  });

  it('throws when the response is not ok', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 401));

    await expect(refreshToken()).rejects.toThrow('Token refresh failed');
  });
});

// ─── logoutServer ─────────────────────────────────────────────────────────────

describe('logoutServer()', () => {
  it('calls POST /api/v1/auth/logout with credentials include', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

    await expect(logoutServer()).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/logout'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('does not throw when fetch rejects (best-effort)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(logoutServer()).resolves.toBeUndefined();
  });

  it('does not throw when server returns an error status', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 500));

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

  beforeEach(async () => {
    await AsyncStorage.setItem('token', 'test-token');
  });

  it('calls PATCH /api/v1/groups/{groupCode}', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(returnedGroup));

    await updateGroup(groupCode, updateBody);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v1/groups/${groupCode}`),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('returns the updated group data', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(returnedGroup));

    const result = await updateGroup(groupCode, updateBody);

    expect(result.name).toBe('New Name');
    expect(result.description).toBe('Updated desc');
    expect(result.group_code).toBe(groupCode);
  });

  it('sends an Authorization header when a token is stored', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(returnedGroup));

    await updateGroup(groupCode, updateBody);

    const calledHeaders = (mockFetch.mock.calls[0] as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(calledHeaders['Authorization']).toBe('Bearer test-token');
  });

  it('throws with server detail message on failure', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ detail: 'Not an admin' }, 403));

    await expect(updateGroup(groupCode, updateBody)).rejects.toThrow('Not an admin');
  });

  it('throws with fallback message when no detail field', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 500));

    await expect(updateGroup(groupCode, {})).rejects.toThrow('Failed to update group');
  });
});
