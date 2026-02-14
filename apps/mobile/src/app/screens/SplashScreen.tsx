import { useEffect } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation';
import { useI18n, useAuth } from '../providers';
import { tokens } from '../../lib/theme';

export default function SplashScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Splash'>>();
  const { t, ready } = useI18n();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (ready && !loading && user) {
      navigation.replace('Main');
    }
  }, [ready, loading, user, navigation]);

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {/* Hero image — 55% of screen */}
      <View style={styles.heroContainer}>
        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1548013146-72479768bada?w=800&auto=format&fit=crop' }}
          style={styles.heroImage}
          resizeMode="cover"
        />
        <View style={styles.heroGradient} pointerEvents="none" />
      </View>

      {/* Content area */}
      <View style={styles.content}>
        <View style={styles.textBlock}>
          <Text style={styles.heroTitle}>{t('splash.heroTitle') || t('splash.welcome')}</Text>
          <Text style={styles.tagline}>{t('splash.tagline')}</Text>
        </View>

        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('Register')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>{t('splash.getStarted')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.outlineButton}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.85}
          >
            <Text style={styles.outlineButtonText}>{t('splash.signIn') || t('auth.login')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.surface,
  },
  heroContainer: {
    height: '55%',
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: 'transparent',
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 28,
    justifyContent: 'space-between',
    paddingBottom: 16,
  },
  textBlock: {
    gap: 8,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: tokens.colors.textDark,
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  tagline: {
    fontSize: 16,
    color: tokens.colors.textSecondary,
    lineHeight: 24,
  },
  buttons: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: tokens.colors.primary,
    paddingVertical: 16,
    borderRadius: tokens.borderRadius['3xl'],
    alignItems: 'center',
    ...tokens.shadow.glass,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  outlineButton: {
    paddingVertical: 16,
    borderRadius: tokens.borderRadius['3xl'],
    alignItems: 'center',
    borderWidth: 2,
    borderColor: tokens.colors.primary,
  },
  outlineButtonText: {
    color: tokens.colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});
