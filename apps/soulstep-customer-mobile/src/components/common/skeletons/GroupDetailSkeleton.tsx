import React from 'react';
import { View, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SkeletonBox, SkeletonCircle, SkeletonText } from '../Skeleton';
import { tokens } from '@/lib/theme';

export default function GroupDetailSkeleton({ isDark = false }: { isDark?: boolean }) {
  const insets = useSafeAreaInsets();
  const bg = isDark ? tokens.colors.darkBg : '#F5F0E9';

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <SkeletonBox isDark={isDark} height={220} borderRadius={0} />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 24,
          gap: 16,
        }}
      >
        <View style={{ gap: 8 }}>
          <SkeletonText isDark={isDark} width="60%" style={{ height: 24 }} />
          <SkeletonText isDark={isDark} width="40%" />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[1, 2, 3].map((i) => (
            <SkeletonBox key={i} isDark={isDark} width={80} height={32} borderRadius={16} />
          ))}
        </View>
        {[1, 2, 3].map((i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <SkeletonCircle isDark={isDark} size={40} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonText isDark={isDark} width="60%" />
              <SkeletonText isDark={isDark} width="40%" />
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
