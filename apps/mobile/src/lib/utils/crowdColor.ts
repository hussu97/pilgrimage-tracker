import { tokens } from '../theme';

export function crowdColor(level?: string): string {
  if (!level) return tokens.colors.textMuted;
  const l = level.toLowerCase();
  if (l === 'low') return '#059669';
  if (l === 'medium') return '#d97706';
  if (l === 'high') return '#dc2626';
  return tokens.colors.textMain;
}
