import { Share } from 'react-native';

export async function shareUrl(title: string, url: string): Promise<'shared' | 'dismissed'> {
  try {
    const result = await Share.share({
      title,
      message: url,
      url: url,
    });
    if (result.action === Share.sharedAction) return 'shared';
    return 'dismissed';
  } catch {
    return 'dismissed';
  }
}
