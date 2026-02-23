import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { tokens } from '@/lib/theme';
import TimingCircle from '@/components/places/TimingCircle';
import DeityCircle from '@/components/places/DeityCircle';
import type { PlaceTiming } from '@/lib/types';

interface Props {
  timings: PlaceTiming[];
  title: string;
  isDark?: boolean;
}

function PlaceTimingsCarousel({ timings, title, isDark = false }: Props) {
  const sectionTitleColor = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carouselContent}
      >
        {timings.map((item, i) => {
          if (item.type === 'deity') return <DeityCircle key={i} item={item} isDark={isDark} />;
          return <TimingCircle key={i} item={item} isDark={isDark} />;
        })}
      </ScrollView>
    </View>
  );
}

export default React.memo(PlaceTimingsCarousel);

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 20,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 16,
  },
  carouselContent: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 8,
    paddingRight: 8,
  },
});
