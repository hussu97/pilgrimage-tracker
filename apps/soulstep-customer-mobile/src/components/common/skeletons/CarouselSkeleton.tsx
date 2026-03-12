import React from 'react';
import { ScrollView, View, Dimensions } from 'react-native';
import { SkeletonBox, SkeletonText } from '../Skeleton';
import { tokens } from '@/lib/theme';

const screenWidth = Dimensions.get('window').width;
const cardWidth = Math.min((screenWidth - 40) / 2.3, 200);

export default function CarouselSkeleton({
  isDark = false,
  count = 3,
}: {
  isDark?: boolean;
  count?: number;
}) {
  const surface = isDark ? tokens.colors.darkSurface : '#ffffff';
  const border = isDark ? tokens.colors.darkBorder : 'rgba(0,0,0,0.06)';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingLeft: 20, paddingRight: 8 }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            width: cardWidth,
            marginRight: 12,
            borderRadius: 16,
            overflow: 'hidden',
            backgroundColor: surface,
            borderWidth: 1,
            borderColor: border,
          }}
        >
          <SkeletonBox isDark={isDark} height={110} borderRadius={0} />
          <View style={{ padding: 10, gap: 6 }}>
            <SkeletonText isDark={isDark} width="80%" />
            <SkeletonText isDark={isDark} width="50%" />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
