import { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation';
import { useI18n } from '../providers';
import { tokens } from '../../lib/theme';

export default function SplashScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Splash'>>();
  const { t, ready } = useI18n();

  useEffect(() => {
    if (ready) {
      navigation.replace('Main');
    }
  }, [ready, navigation]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.bgPattern} pointerEvents="none" />
      <View style={styles.centered}>
        <View style={styles.logoOuter}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>⊕</Text>
          </View>
        </View>
        <Text style={styles.title}>{t('splash.appName') || 'Pilgrimage'}</Text>
        <Text style={styles.tagline}>{t('splash.tagline')}</Text>
        <ActivityIndicator size="large" color={tokens.colors.primary} style={styles.spinner} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.surfaceTint },
  bgPattern: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'transparent',
    opacity: 0.5,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logoOuter: {
    marginBottom: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 144,
    height: 144,
    borderRadius: tokens.borderRadius['3xl'],
    backgroundColor: tokens.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...tokens.shadow.card,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  logoText: { fontSize: 72, color: tokens.colors.primary, fontWeight: '300' },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: tokens.colors.textDark,
    marginBottom: 20,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 18,
    color: tokens.colors.textMain,
    textAlign: 'center',
    marginBottom: 48,
    lineHeight: 26,
    opacity: 0.9,
  },
  spinner: { marginTop: 24 },
});
