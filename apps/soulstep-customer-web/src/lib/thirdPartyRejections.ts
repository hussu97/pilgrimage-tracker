export const THIRD_PARTY_ADS_ACTIVE_FLAG = '__soulstepThirdPartyAdsActive';

type ThirdPartyAdsWindow = Window &
  typeof globalThis & {
    [THIRD_PARTY_ADS_ACTIVE_FLAG]?: boolean;
  };

interface SentryExceptionValue {
  type?: string;
  value?: string;
}

interface SentryEventLike {
  exception?: {
    values?: SentryExceptionValue[];
  };
}

export function markThirdPartyAdsActive(): void {
  if (typeof window === 'undefined') return;
  (window as ThirdPartyAdsWindow)[THIRD_PARTY_ADS_ACTIVE_FLAG] = true;
}

export function areThirdPartyAdsActive(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as ThirdPartyAdsWindow)[THIRD_PARTY_ADS_ACTIVE_FLAG] === true
  );
}

export function isUndefinedUnhandledRejectionEvent(event: SentryEventLike): boolean {
  const values = event.exception?.values ?? [];
  return values.some(
    (value) =>
      value.type === 'UnhandledRejection' &&
      value.value === 'Non-Error promise rejection captured with value: undefined',
  );
}

export function shouldDropSentryEventForThirdPartyAds(event: SentryEventLike): boolean {
  return areThirdPartyAdsActive() && isUndefinedUnhandledRejectionEvent(event);
}
