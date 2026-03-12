/**
 * OnboardingScreen — 3-card swipeable onboarding flow shown on first launch.
 * On completion or skip, sets AsyncStorage 'onboarding_done' = '1'
 * and navigates to Main.
 */
import { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import type { ListRenderItemInfo, ViewToken } from 'react-native';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Dimensions,
  StyleSheet,
  Animated,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation';
import { useI18n, useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO = require('../../../assets/logo.png') as number;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Clamp logo size: 140 on phones, 180 on tablets
const LOGO_SIZE = Math.min(Math.round(SCREEN_WIDTH * 0.38), 180);

interface CardData {
  titleKey: string;
  descKey: string;
  icon: string;
  bgLight: string;
  bgDark: string;
}

const CARDS: CardData[] = [
  {
    titleKey: 'onboarding.card1Title',
    descKey: 'onboarding.card1Desc',
    icon: '📖',
    bgLight: '#FFF5F0',
    bgDark: '#2A1E1A',
  },
  {
    titleKey: 'onboarding.card2Title',
    descKey: 'onboarding.card2Desc',
    icon: '🗺️',
    bgLight: '#F0F8FF',
    bgDark: '#1A2030',
  },
  {
    titleKey: 'onboarding.card3Title',
    descKey: 'onboarding.card3Desc',
    icon: '🧭',
    bgLight: '#F0FFF8',
    bgDark: '#1A2A24',
  },
];

function makeStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? tokens.colors.darkBg : '#FAF6F1',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 4,
    },
    skipText: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary,
    },
    // ── Logo section ──────────────────────────────────────
    logoSection: {
      alignItems: 'center',
      paddingVertical: 16,
    },
    logoGlow: {
      // Outer glow container — slightly larger, provides the halo effect
      width: LOGO_SIZE + 20,
      height: LOGO_SIZE + 20,
      borderRadius: (LOGO_SIZE + 20) / 4,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(176,86,61,0.12)' : 'rgba(176,86,61,0.08)',
    },
    logo: {
      width: LOGO_SIZE,
      height: LOGO_SIZE,
      borderRadius: LOGO_SIZE / 5,
      ...(isDark
        ? {
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.1)',
          }
        : {
            shadowColor: '#B0563D',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.18,
            shadowRadius: 20,
            elevation: 8,
          }),
    },
    // ── Cards ─────────────────────────────────────────────
    cardWrapper: {
      width: SCREEN_WIDTH,
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    card: {
      width: '100%',
      borderRadius: tokens.borderRadius['3xl'],
      padding: 28,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 260,
    },
    iconContainer: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.7)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    iconText: {
      fontSize: 36,
    },
    cardTitle: {
      fontSize: 21,
      fontWeight: '700',
      color: isDark ? tokens.colors.surface : tokens.colors.textDark,
      textAlign: 'center',
      marginBottom: 10,
    },
    cardDesc: {
      fontSize: 14,
      lineHeight: 21,
      color: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary,
      textAlign: 'center',
    },
    // ── Bottom controls ───────────────────────────────────
    dotsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      marginTop: 20,
      marginBottom: 6,
    },
    dot: {
      height: 8,
      borderRadius: 4,
    },
    dotActive: {
      width: 24,
      backgroundColor: tokens.colors.primary,
    },
    dotInactive: {
      width: 8,
      backgroundColor: isDark ? tokens.colors.darkBorder : '#D1C7BD',
    },
    footer: {
      paddingHorizontal: 24,
      paddingTop: 6,
    },
    ctaButton: {
      backgroundColor: tokens.colors.primary,
      borderRadius: tokens.borderRadius['2xl'],
      paddingVertical: 14,
      alignItems: 'center',
      shadowColor: tokens.colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 6,
    },
    ctaText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
    },
  });
}

export default function OnboardingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Onboarding'>>();
  const { t } = useI18n();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList<CardData>>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const logoAnim = useRef(new Animated.Value(0)).current;

  // Logo entrance animation on mount
  useEffect(() => {
    Animated.spring(logoAnim, {
      toValue: 1,
      friction: 6,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [logoAnim]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        Animated.sequence([
          Animated.timing(fadeAnim, { toValue: 0.7, duration: 150, useNativeDriver: true }),
          Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]).start();
      }
    },
    [fadeAnim],
  );
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  async function finish() {
    try {
      await AsyncStorage.setItem('onboarding_done', '1');
    } catch {
      // ignore storage errors
    }
    navigation.replace('Main');
  }

  function next() {
    if (currentIndex < CARDS.length - 1) {
      const nextIdx = currentIndex + 1;
      flatListRef.current?.scrollToIndex({ index: nextIdx, animated: true });
      setCurrentIndex(nextIdx);
    } else {
      finish();
    }
  }

  function onMomentumScrollEnd(e: { nativeEvent: { contentOffset: { x: number } } }) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentIndex(idx);
  }

  const isLast = currentIndex === CARDS.length - 1;

  function renderCard({ item }: ListRenderItemInfo<CardData>) {
    const bg = isDark ? item.bgDark : item.bgLight;
    return (
      <View style={styles.cardWrapper}>
        <View style={[styles.card, { backgroundColor: bg }]}>
          <View style={styles.iconContainer}>
            <Text style={styles.iconText}>{item.icon}</Text>
          </View>
          <Text style={styles.cardTitle}>{t(item.titleKey)}</Text>
          <Text style={styles.cardDesc}>{t(item.descKey)}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Skip */}
      <View style={styles.header}>
        <TouchableOpacity onPress={finish} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Logo ───────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.logoSection,
          {
            opacity: logoAnim,
            transform: [
              {
                translateY: logoAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-20, 0],
                }),
              },
              {
                scale: logoAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.85, 1],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.logoGlow}>
          <Image source={LOGO} style={styles.logo} resizeMode="cover" />
        </View>
      </Animated.View>

      {/* Cards */}
      <FlatList
        ref={flatListRef}
        data={CARDS}
        renderItem={renderCard}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      />

      {/* Dots + CTA wrapped in fade animation */}
      <Animated.View style={{ opacity: fadeAnim }}>
        {/* Dots */}
        <View style={styles.dotsRow}>
          {CARDS.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === currentIndex ? styles.dotActive : styles.dotInactive]}
            />
          ))}
        </View>

        {/* CTA */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
          <TouchableOpacity style={styles.ctaButton} onPress={next} activeOpacity={0.85}>
            <Text style={styles.ctaText}>
              {isLast ? t('onboarding.getStarted') : t('onboarding.next')}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}
