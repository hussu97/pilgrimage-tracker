export function hasCoordinates<T extends { lat?: number | null; lng?: number | null }>(
  value: T | null | undefined,
): value is T & { lat: number; lng: number } {
  return typeof value?.lat === 'number' && typeof value.lng === 'number';
}
