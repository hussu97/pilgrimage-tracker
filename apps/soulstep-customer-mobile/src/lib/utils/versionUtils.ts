/**
 * App version comparison utilities for soft/hard update logic.
 */

/** Parse a semver string like "1.2.3" into [major, minor, patch]. */
export function parseSemver(version: string): [number, number, number] {
  const parts = version
    .trim()
    .split('.')
    .slice(0, 3)
    .map((p) => parseInt(p, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return [parts[0], parts[1], parts[2]];
}

/** Return true if current >= minimum (semver). Empty minimum disables check. */
export function versionMeetsMinimum(current: string, minimum: string): boolean {
  if (!minimum) return true;
  const [cMaj, cMin, cPat] = parseSemver(current);
  const [mMaj, mMin, mPat] = parseSemver(minimum);
  if (cMaj !== mMaj) return cMaj > mMaj;
  if (cMin !== mMin) return cMin > mMin;
  return cPat >= mPat;
}

/** Return true when a soft-update banner should be shown. */
export function shouldSoftUpdate(current: string, minVersionSoft: string): boolean {
  if (!minVersionSoft) return false;
  return !versionMeetsMinimum(current, minVersionSoft);
}
