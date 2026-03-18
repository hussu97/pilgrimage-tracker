import { tokens } from '@/lib/theme';

export function crowdColor(level?: string): string {
  if (!level) return tokens.colors.textMuted;
  const l = level.toLowerCase();
  if (l === 'low') return tokens.colors.crowdLow;
  if (l === 'medium') return tokens.colors.crowdMedium;
  if (l === 'high') return tokens.colors.error;
  return tokens.colors.textMain;
}
