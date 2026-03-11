/**
 * Mobile tests for Phase 4 Journey UX utilities.
 * Tests pure logic functions extracted from JoinJourneyModal, GroupsScreen, and GroupDetailScreen.
 */

// ── JoinJourneyModal: code validation ────────────────────────────────────────

function isCodeLongEnough(code: string, minLength: number = 6): boolean {
  return code.trim().length >= minLength;
}

describe('isCodeLongEnough', () => {
  it('returns false for empty string', () => {
    expect(isCodeLongEnough('')).toBe(false);
  });

  it('returns false for 5-char code', () => {
    expect(isCodeLongEnough('ab123')).toBe(false);
  });

  it('returns true for exactly 6 chars', () => {
    expect(isCodeLongEnough('abc123')).toBe(true);
  });

  it('returns true for longer codes', () => {
    expect(isCodeLongEnough('inviteCode2026')).toBe(true);
  });

  it('trims whitespace before measuring', () => {
    expect(isCodeLongEnough('  ab12  ')).toBe(false);
    expect(isCodeLongEnough('  abc123  ')).toBe(true);
  });
});

// ── JoinJourneyModal: error message categorization ────────────────────────────

function categorizeJoinError(msg: string): 'already_member' | 'journey_full' | 'invalid_code' {
  if (msg.toLowerCase().includes('already')) return 'already_member';
  if (msg.toLowerCase().includes('full')) return 'journey_full';
  return 'invalid_code';
}

describe('categorizeJoinError', () => {
  it('detects already member', () => {
    expect(categorizeJoinError('Already a member of this group')).toBe('already_member');
    expect(categorizeJoinError('already joined')).toBe('already_member');
  });

  it('detects journey full', () => {
    expect(categorizeJoinError('Journey is full')).toBe('journey_full');
    expect(categorizeJoinError('This group is full')).toBe('journey_full');
  });

  it('defaults to invalid_code', () => {
    expect(categorizeJoinError('Not found')).toBe('invalid_code');
    expect(categorizeJoinError('Invalid invite')).toBe('invalid_code');
    expect(categorizeJoinError('')).toBe('invalid_code');
  });
});

// ── GroupsScreen: stats calculation ──────────────────────────────────────────

interface MockGroup {
  sites_visited?: number;
  total_sites?: number;
}

function calcTotalVisited(groups: MockGroup[]): number {
  return groups.reduce((sum, g) => sum + (g.sites_visited ?? 0), 0);
}

function calcTotalSites(groups: MockGroup[]): number {
  return groups.reduce((sum, g) => sum + (g.total_sites ?? 0), 0);
}

describe('calcTotalVisited', () => {
  it('returns 0 for empty array', () => {
    expect(calcTotalVisited([])).toBe(0);
  });

  it('sums sites_visited across groups', () => {
    const groups: MockGroup[] = [
      { sites_visited: 3, total_sites: 10 },
      { sites_visited: 5, total_sites: 8 },
      { sites_visited: 0, total_sites: 4 },
    ];
    expect(calcTotalVisited(groups)).toBe(8);
  });

  it('treats missing sites_visited as 0', () => {
    const groups: MockGroup[] = [{ total_sites: 5 }, { sites_visited: 2, total_sites: 5 }];
    expect(calcTotalVisited(groups)).toBe(2);
  });
});

describe('calcTotalSites', () => {
  it('sums total_sites across groups', () => {
    const groups: MockGroup[] = [
      { sites_visited: 1, total_sites: 10 },
      { sites_visited: 2, total_sites: 5 },
    ];
    expect(calcTotalSites(groups)).toBe(15);
  });

  it('treats missing total_sites as 0', () => {
    const groups: MockGroup[] = [{ sites_visited: 1 }, { sites_visited: 2, total_sites: 8 }];
    expect(calcTotalSites(groups)).toBe(8);
  });
});

// ── GroupsScreen: progress level labels ──────────────────────────────────────

function progressLevelKey(sites: number, total: number): string {
  if (total <= 0) return '';
  const pct = Math.floor((sites / total) * 100);
  if (pct >= 100) return 'done';
  if (pct >= 80) return 'level5';
  if (pct >= 60) return 'level4';
  if (pct >= 40) return 'level3';
  if (pct >= 20) return 'level2';
  if (sites > 0) return 'level1';
  return 'new';
}

describe('progressLevelKey', () => {
  it('returns empty string when total is 0', () => {
    expect(progressLevelKey(0, 0)).toBe('');
  });

  it('returns new when no sites visited', () => {
    expect(progressLevelKey(0, 10)).toBe('new');
  });

  it('returns done at 100%', () => {
    expect(progressLevelKey(10, 10)).toBe('done');
  });

  it('returns level1 for 1-19%', () => {
    expect(progressLevelKey(1, 10)).toBe('level1'); // 10%
    expect(progressLevelKey(1, 7)).toBe('level1'); // ~14%
  });

  it('returns level2 for 20-39%', () => {
    expect(progressLevelKey(2, 10)).toBe('level2'); // 20%
    expect(progressLevelKey(3, 10)).toBe('level2'); // 30%
  });

  it('returns level3 for 40-59%', () => {
    expect(progressLevelKey(4, 10)).toBe('level3'); // 40%
    expect(progressLevelKey(5, 10)).toBe('level3'); // 50%
  });

  it('returns level4 for 60-79%', () => {
    expect(progressLevelKey(6, 10)).toBe('level4'); // 60%
    expect(progressLevelKey(7, 10)).toBe('level4'); // 70%
  });

  it('returns level5 for 80-99%', () => {
    expect(progressLevelKey(8, 10)).toBe('level5'); // 80%
    expect(progressLevelKey(9, 10)).toBe('level5'); // 90%
  });
});

// ── GroupDetailScreen: check-in state transitions ────────────────────────────

type CheckInState = 'idle' | 'loading' | 'success' | 'error';

function reduceCheckInState(
  current: CheckInState,
  action: 'start' | 'success' | 'error',
): CheckInState {
  switch (action) {
    case 'start':
      return 'loading';
    case 'success':
      return 'success';
    case 'error':
      return 'error';
    default:
      return current;
  }
}

describe('reduceCheckInState', () => {
  it('transitions to loading on start', () => {
    expect(reduceCheckInState('idle', 'start')).toBe('loading');
  });

  it('transitions to success on success', () => {
    expect(reduceCheckInState('loading', 'success')).toBe('success');
  });

  it('transitions to error on error', () => {
    expect(reduceCheckInState('loading', 'error')).toBe('error');
  });

  it('stays at success if success is dispatched again', () => {
    expect(reduceCheckInState('success', 'success')).toBe('success');
  });
});

// ── JourneyMapView: HTML generation helpers ───────────────────────────────────

interface MapPlace {
  place_code: string;
  name: string;
  latitude: number;
  longitude: number;
  user_checked_in?: boolean;
}

function buildMarkersJson(places: MapPlace[]): string {
  return JSON.stringify(
    places.map((p) => ({
      lat: p.latitude,
      lng: p.longitude,
      name: p.name,
      placeCode: p.place_code,
      checked: p.user_checked_in ?? false,
    })),
  );
}

describe('buildMarkersJson', () => {
  it('returns empty array JSON for no places', () => {
    expect(buildMarkersJson([])).toBe('[]');
  });

  it('maps latitude/longitude correctly', () => {
    const places: MapPlace[] = [
      { place_code: 'plc_1', name: 'Mecca', latitude: 21.4225, longitude: 39.8262 },
    ];
    const result = JSON.parse(buildMarkersJson(places));
    expect(result[0].lat).toBe(21.4225);
    expect(result[0].lng).toBe(39.8262);
  });

  it('defaults checked to false when user_checked_in is undefined', () => {
    const places: MapPlace[] = [{ place_code: 'plc_1', name: 'Test', latitude: 0, longitude: 0 }];
    const result = JSON.parse(buildMarkersJson(places));
    expect(result[0].checked).toBe(false);
  });

  it('sets checked to true when user_checked_in is true', () => {
    const places: MapPlace[] = [
      { place_code: 'plc_1', name: 'Test', latitude: 0, longitude: 0, user_checked_in: true },
    ];
    const result = JSON.parse(buildMarkersJson(places));
    expect(result[0].checked).toBe(true);
  });

  it('uses place_code as placeCode', () => {
    const places: MapPlace[] = [
      { place_code: 'plc_abc123', name: 'Test', latitude: 0, longitude: 0 },
    ];
    const result = JSON.parse(buildMarkersJson(places));
    expect(result[0].placeCode).toBe('plc_abc123');
  });
});
