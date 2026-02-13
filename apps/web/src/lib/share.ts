/**
 * Share a URL: use Web Share API when available, otherwise copy to clipboard.
 */
export async function shareUrl(title: string, url: string): Promise<'shared' | 'copied'> {
  const fullUrl = url.startsWith('http') ? url : `${typeof window !== 'undefined' ? window.location.origin : ''}${url}`;
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title,
        url: fullUrl,
        text: title,
      });
      return 'shared';
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'shared';
      // fall through to copy
    }
  }
  try {
    await navigator.clipboard.writeText(fullUrl);
    return 'copied';
  } catch {
    return 'copied'; // best effort
  }
}
