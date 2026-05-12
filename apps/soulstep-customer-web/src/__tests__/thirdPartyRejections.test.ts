import { afterEach, describe, expect, it } from 'vitest';
import {
  THIRD_PARTY_ADS_ACTIVE_FLAG,
  areThirdPartyAdsActive,
  isUndefinedUnhandledRejectionEvent,
  markThirdPartyAdsActive,
  shouldDropSentryEventForThirdPartyAds,
} from '@/lib/thirdPartyRejections';

const undefinedUnhandledRejection = {
  exception: {
    values: [
      {
        type: 'UnhandledRejection',
        value: 'Non-Error promise rejection captured with value: undefined',
      },
    ],
  },
};

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)[THIRD_PARTY_ADS_ACTIVE_FLAG];
});

describe('third-party rejection guards', () => {
  it('recognizes undefined unhandled rejection events', () => {
    expect(isUndefinedUnhandledRejectionEvent(undefinedUnhandledRejection)).toBe(true);
    expect(
      isUndefinedUnhandledRejectionEvent({
        exception: { values: [{ type: 'TypeError', value: 'Cannot read properties of null' }] },
      }),
    ).toBe(false);
  });

  it('only drops undefined unhandled rejections after third-party ads are active', () => {
    expect(areThirdPartyAdsActive()).toBe(false);
    expect(shouldDropSentryEventForThirdPartyAds(undefinedUnhandledRejection)).toBe(false);

    markThirdPartyAdsActive();

    expect(areThirdPartyAdsActive()).toBe(true);
    expect(shouldDropSentryEventForThirdPartyAds(undefinedUnhandledRejection)).toBe(true);
    expect(
      shouldDropSentryEventForThirdPartyAds({
        exception: { values: [{ type: 'UnhandledRejection', value: 'real failure' }] },
      }),
    ).toBe(false);
  });
});
