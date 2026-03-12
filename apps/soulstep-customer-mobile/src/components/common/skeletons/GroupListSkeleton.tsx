import React from 'react';
import { View, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SkeletonBox, SkeletonText } from '../Skeleton';
import { tokens } from '@/lib/theme';

export default function GroupListSkeleton({
  isDark = false,
  count = 4,
}: {
  isDark?: boolean;
  count?: number;
}) {
  const insets = useSafeAreaInsets();
  const bg = isDark ? tokens.colors.darkBg : '#F5F0E9';
  const surface = isDark ? tokens.colors.darkSurface : '#ffffff';

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 80,
        }}
      >
        {Array.from({ length: count }).map((_, i) => (
          <View
            key={i}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              backgroundColor: surface,
              borderRadius: 16,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <SkeletonBox isDark={isDark} width={56} height={56} borderRadius={12} />
            <View style={{ flex: 1, gap: 8 }}>
              <SkeletonText isDark={isDark} width="70%" />
              <SkeletonText isDark={isDark} width="40%" />
              <SkeletonBox isDark={isDark} height={6} borderRadius={3} />
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
