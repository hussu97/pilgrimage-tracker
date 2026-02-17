import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { tokens } from '@/lib/theme';

interface SkeletonCardProps {
  isDark?: boolean;
}

/**
 * Pulsing placeholder card that matches the shape of a full-mode PlaceCard.
 * Used while the places list is loading.
 */
export default function SkeletonCard({ isDark = false }: SkeletonCardProps) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.85, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 750, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  const baseBg = isDark ? tokens.colors.darkSurface : '#e2e8f0';
  const shineBg = isDark ? tokens.colors.darkBorder : '#cbd5e1';

  return (
    <Animated.View style={[styles.card, { backgroundColor: baseBg, opacity }]}>
      {/* Hero image placeholder */}
      <View style={[styles.image, { backgroundColor: shineBg }]} />

      {/* Info strip at bottom */}
      <View style={styles.info}>
        <View style={[styles.line, styles.lineLong, { backgroundColor: shineBg }]} />
        <View style={[styles.line, styles.lineMedium, { backgroundColor: shineBg }]} />
        <View style={styles.metaRow}>
          <View style={[styles.pill, { backgroundColor: shineBg }]} />
          <View style={[styles.pill, styles.pillSmall, { backgroundColor: shineBg }]} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: tokens.borderRadius['2xl'],
    overflow: 'hidden',
    height: 260,
  },
  image: {
    flex: 1,
  },
  info: {
    padding: 12,
    gap: 8,
  },
  line: {
    height: 11,
    borderRadius: 6,
  },
  lineLong: { width: '65%' },
  lineMedium: { width: '45%' },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  pill: {
    height: 22,
    width: 56,
    borderRadius: tokens.borderRadius.full,
  },
  pillSmall: { width: 40 },
});
