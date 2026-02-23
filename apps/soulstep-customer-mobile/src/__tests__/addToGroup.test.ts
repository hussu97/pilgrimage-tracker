import AsyncStorage from '@react-native-async-storage/async-storage';
import { addPlaceToGroup } from '@/lib/api/client';

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

describe('addPlaceToGroup()', () => {
  it('calls POST /api/v1/groups/:groupCode/places/:placeCode', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true, already_exists: false }));

    const result = await addPlaceToGroup('grp_abc', 'plc_xyz');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/groups/grp_abc/places/plc_xyz'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.ok).toBe(true);
    expect(result.already_exists).toBe(false);
  });

  it('returns already_exists=true when place is already in the group', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true, already_exists: true }));

    const result = await addPlaceToGroup('grp_abc', 'plc_xyz');

    expect(result.already_exists).toBe(true);
  });

  it('throws when the server returns an error', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ detail: 'Not a member' }, 403));

    await expect(addPlaceToGroup('grp_abc', 'plc_xyz')).rejects.toThrow('Not a member');
  });

  it('throws a generic message when detail is missing', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 500));

    await expect(addPlaceToGroup('grp_abc', 'plc_xyz')).rejects.toThrow(
      'Failed to add place to group',
    );
  });
});
