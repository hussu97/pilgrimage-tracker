import { Share, Platform, Linking } from 'react-native';

/**
 * Opens the native maps app with turn-by-turn directions to the given coordinates.
 * Uses maps:// on iOS (Apple Maps) and geo: on Android (Google Maps / any maps app).
 * Falls back to a web Google Maps URL if the native scheme is unsupported.
 */
export function openDirections(lat: number, lng: number, label?: string): void {
  const encodedLabel = encodeURIComponent(label ?? '');
  const nativeUrl = Platform.select({
    ios: `maps://?daddr=${lat},${lng}`,
    android: `geo:${lat},${lng}?q=${lat},${lng}${encodedLabel ? `(${encodedLabel})` : ''}`,
  });
  const fallbackUrl = `https://maps.google.com/?daddr=${lat},${lng}`;

  if (!nativeUrl) {
    Linking.openURL(fallbackUrl);
    return;
  }

  Linking.canOpenURL(nativeUrl)
    .then((supported) => Linking.openURL(supported ? nativeUrl : fallbackUrl))
    .catch(() => Linking.openURL(fallbackUrl));
}

export async function shareUrl(title: string, url: string): Promise<'shared' | 'dismissed'> {
  try {
    // On iOS, passing a non-http `url` to Share.share throws. Only include the
    // `url` field when the value is a proper http/https URL.
    const sharePayload: { title: string; message: string; url?: string } = { title, message: url };
    if (url.startsWith('http')) sharePayload.url = url;
    const result = await Share.share(sharePayload);
    if (result.action === Share.sharedAction) return 'shared';
    return 'dismissed';
  } catch {
    return 'dismissed';
  }
}
