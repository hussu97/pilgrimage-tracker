import React from 'react';
import { View, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SkeletonBox, SkeletonCircle, SkeletonText } from '../Skeleton';
import { tokens } from '@/lib/theme';

export default function ProfileSkeleton({ isDark = false }: { isDark?: boolean }) {
  const insets = useSafeAreaInsets();
  const bg = isDark ? tokens.colors.darkBg : '#F5F0E9';

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 24,
          paddingBottom: insets.bottom + 80,
          gap: 16,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <SkeletonCircle isDark={isDark} size={72} />
          <View style={{ flex: 1, gap: 8 }}>
            <SkeletonText isDark={isDark} width="60%" style={{ height: 20 }} />
            <SkeletonText isDark={isDark} width="40%" />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <SkeletonBox
              key={i}
              isDark={isDark}
              style={{ flex: 1 }}
              height={80}
              borderRadius={16}
            />
          ))}
        </View>
        {[1, 2, 3, 4].map((i) => (
          <SkeletonBox key={i} isDark={isDark} height={48} borderRadius={12} />
        ))}
      </ScrollView>
    </View>
  );
}
