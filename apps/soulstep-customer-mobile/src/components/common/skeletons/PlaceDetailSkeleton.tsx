import React from 'react';
import { View, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SkeletonBox, SkeletonText } from '../Skeleton';
import { tokens } from '@/lib/theme';

export default function PlaceDetailSkeleton({ isDark = false }: { isDark?: boolean }) {
  const insets = useSafeAreaInsets();
  const bg = isDark ? tokens.colors.darkBg : '#F5F0E9';

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <SkeletonBox isDark={isDark} height={260} borderRadius={0} />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 24,
          gap: 16,
        }}
      >
        <View style={{ gap: 8 }}>
          <SkeletonText isDark={isDark} width="70%" style={{ height: 28 }} />
          <SkeletonText isDark={isDark} width="50%" />
        </View>
        <SkeletonBox isDark={isDark} height={80} borderRadius={12} />
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <SkeletonBox isDark={isDark} width={20} height={20} borderRadius={4} />
            <SkeletonText isDark={isDark} width="60%" />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
