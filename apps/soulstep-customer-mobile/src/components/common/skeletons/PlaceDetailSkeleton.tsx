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
      {/* Hero */}
      <SkeletonBox isDark={isDark} height={300} borderRadius={0} />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 80,
          gap: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title + address */}
        <View style={{ gap: 8 }}>
          <SkeletonText isDark={isDark} width="75%" style={{ height: 28 }} />
          <SkeletonText isDark={isDark} width="55%" />
        </View>
        {/* Scorecard strip */}
        <SkeletonBox isDark={isDark} height={80} borderRadius={16} />
        {/* Timings carousel */}
        <View style={{ gap: 10 }}>
          <SkeletonText isDark={isDark} width="40%" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[1, 2].map((i) => (
              <SkeletonBox key={i} isDark={isDark} width={140} height={80} borderRadius={12} />
            ))}
          </View>
        </View>
        {/* Specs section */}
        <View style={{ gap: 8 }}>
          <SkeletonText isDark={isDark} width="35%" />
          {[1, 2, 3].map((i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <SkeletonBox isDark={isDark} width={20} height={20} borderRadius={4} />
              <SkeletonText isDark={isDark} width="60%" />
            </View>
          ))}
        </View>
        {/* Reviews area */}
        <View style={{ gap: 8 }}>
          <SkeletonText isDark={isDark} width="25%" />
          {[1, 2].map((i) => (
            <SkeletonBox key={i} isDark={isDark} height={70} borderRadius={12} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
