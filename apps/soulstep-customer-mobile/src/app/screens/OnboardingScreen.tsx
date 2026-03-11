/**
 * OnboardingScreen — 3-card swipeable onboarding flow shown on first launch.
 * On completion or skip, sets AsyncStorage 'onboarding_done' = '1'
 * and navigates to Main.
 */
import { useRef, useState, useMemo, useCallback } from 'react';
import type { ListRenderItemInfo, ViewToken } from 'react-native';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Dimensions,
  StyleSheet,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation';
import { useI18n, useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
      backgroundColor: isDark ? tokens.colors.darkBg : tokens.colors.surface,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 8,
    },
    skipText: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary,
    },
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
      padding: 32,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 340,
    },
    iconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    iconText: {
      fontSize: 40,
    },
    cardTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: isDark ? tokens.colors.surface : tokens.colors.textDark,
      textAlign: 'center',
      marginBottom: 12,
    },
    cardDesc: {
      fontSize: 15,
      lineHeight: 22,
      color: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary,
      textAlign: 'center',
    },
    dotsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      marginTop: 24,
      marginBottom: 8,
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
      paddingBottom: 40,
      paddingTop: 8,
    },
    ctaButton: {
      backgroundColor: tokens.colors.primary,
      borderRadius: tokens.borderRadius['2xl'],
      paddingVertical: 14,
      alignItems: 'center',
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
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList<CardData>>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

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
    <View style={styles.container}>
      {/* Skip */}
      <View style={styles.header}>
        <TouchableOpacity onPress={finish} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
        </TouchableOpacity>
      </View>

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
        <View style={styles.footer}>
          <TouchableOpacity style={styles.ctaButton} onPress={next} activeOpacity={0.85}>
            <Text style={styles.ctaText}>{isLast ? t('onboarding.getStarted') : 'Next →'}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}
