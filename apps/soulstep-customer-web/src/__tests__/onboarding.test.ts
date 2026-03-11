/**
 * Onboarding logic tests.
 * Tests pure functions that determine onboarding routing behavior.
 */
import { describe, it, expect } from 'vitest';

/** Pure logic: should user be redirected to onboarding? */
function shouldRedirectToOnboarding(onboardingDoneFlag: string | null, user: unknown): boolean {
  return !onboardingDoneFlag && !user;
}

/** Pure logic: is the onboarding flag correctly set? */
function isOnboardingFlagValid(value: string | null): boolean {
  return value === '1';
}

describe('Onboarding redirect logic', () => {
  it('redirects when flag is null and no user', () => {
    expect(shouldRedirectToOnboarding(null, null)).toBe(true);
  });

  it('does not redirect when flag is set to "1"', () => {
    expect(shouldRedirectToOnboarding('1', null)).toBe(false);
  });

  it('does not redirect when user exists even if flag is missing', () => {
    expect(shouldRedirectToOnboarding(null, { email: 'a@b.com' })).toBe(false);
  });

  it('does not redirect when both flag and user are present', () => {
    expect(shouldRedirectToOnboarding('1', { email: 'a@b.com' })).toBe(false);
  });
});

describe('Onboarding flag validation', () => {
  it('returns true for value "1"', () => {
    expect(isOnboardingFlagValid('1')).toBe(true);
  });

  it('returns false for null', () => {
    expect(isOnboardingFlagValid(null)).toBe(false);
  });

  it('returns false for "true" (wrong value)', () => {
    expect(isOnboardingFlagValid('true')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isOnboardingFlagValid('')).toBe(false);
  });
});
