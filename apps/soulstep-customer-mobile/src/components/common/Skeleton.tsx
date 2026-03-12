import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { tokens } from '@/lib/theme';

interface SkeletonProps {
  isDark?: boolean;
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: object;
}

export function SkeletonBox({
  isDark = false,
  width,
  height = 16,
  borderRadius = 8,
  style,
}: SkeletonProps) {
  const anim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [anim]);

  return (
    <Animated.View
      style={[
        {
          backgroundColor: isDark ? tokens.colors.darkSurface : '#E5DDD6',
          borderRadius,
          width: width ?? '100%',
          height,
          opacity: anim,
        },
        style,
      ]}
    />
  );
}

export function SkeletonCircle({
  isDark = false,
  size = 40,
  style,
}: {
  isDark?: boolean;
  size?: number;
  style?: object;
}) {
  return (
    <SkeletonBox isDark={isDark} width={size} height={size} borderRadius={size / 2} style={style} />
  );
}

export function SkeletonText({
  isDark = false,
  width = '100%',
  style,
}: {
  isDark?: boolean;
  width?: number | string;
  style?: object;
}) {
  return <SkeletonBox isDark={isDark} width={width} height={12} borderRadius={6} style={style} />;
}
