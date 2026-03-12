import React from 'react';
import { View, ScrollView, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SkeletonBox, SkeletonCircle, SkeletonText } from '../Skeleton';
import CarouselSkeleton from './CarouselSkeleton';
import { tokens } from '@/lib/theme';

const screenWidth = Dimensions.get('window').width;
const actionCardWidth = (screenWidth - 40 - 12) / 2;

export default function HomeSkeleton({ isDark = false }: { isDark?: boolean }) {
  const insets = useSafeAreaInsets();
  const bg = isDark ? tokens.colors.darkBg : '#F5F0E9';

  return (
    <View style={{ flex: 1, backgroundColor: bg, paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 8,
          }}
        >
          <View style={{ gap: 4 }}>
            <SkeletonBox isDark={isDark} width={80} height={36} borderRadius={8} />
            <SkeletonText isDark={isDark} width={100} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <SkeletonCircle isDark={isDark} size={36} />
            <SkeletonCircle isDark={isDark} size={36} />
          </View>
        </View>

        {/* Hero card */}
        <SkeletonBox
          isDark={isDark}
          style={{ marginHorizontal: 20, marginTop: 16 }}
          height={176}
          borderRadius={24}
        />

        {/* Quick actions */}
        <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {[1, 2, 3, 4].map((i) => (
              <SkeletonBox
                key={i}
                isDark={isDark}
                width={actionCardWidth}
                height={96}
                borderRadius={20}
              />
            ))}
          </View>
        </View>

        {/* Carousel 1 */}
        <View style={{ marginTop: 24 }}>
          <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
            <SkeletonText isDark={isDark} width={140} />
          </View>
          <CarouselSkeleton isDark={isDark} count={3} />
        </View>

        {/* Carousel 2 */}
        <View style={{ marginTop: 24 }}>
          <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
            <SkeletonText isDark={isDark} width={120} />
          </View>
          <CarouselSkeleton isDark={isDark} count={3} />
        </View>
      </ScrollView>
    </View>
  );
}
