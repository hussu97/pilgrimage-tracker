import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation';
import { useI18n } from '../providers';

const PRIMARY = '#007AFF';

export default function SplashScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Splash'>>();
  const { t } = useI18n();

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Subtle background gradient similar to DESIGN_FILE */}
      <View style={styles.bgPattern} pointerEvents="none" />
      <View style={styles.centered}>
        {/* Logo: DESIGN_FILE-style rounded container with compass-style icon */}
        <View style={styles.logoOuter}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>⊕</Text>
          </View>
        </View>
        <Text style={styles.title}>{t('splash.appName') || 'Pilgrimage'}</Text>
        <Text style={styles.tagline}>{t('splash.tagline')}</Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('Register')}
          activeOpacity={0.9}
        >
          <Text style={styles.primaryButtonText}>{t('splash.getStarted')}</Text>
          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.8}
        >
          <Text style={styles.linkText}>{t('splash.haveAccount')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
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
    borderRadius: 32,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 30,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  logoText: { fontSize: 72, color: PRIMARY, fontWeight: '300' },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: '#111',
    marginBottom: 20,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 18,
    color: '#333',
    textAlign: 'center',
    marginBottom: 48,
    lineHeight: 26,
    opacity: 0.9,
  },
  primaryButton: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: PRIMARY,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  arrow: { color: '#fff', fontSize: 14, marginLeft: 8 },
  linkButton: { marginTop: 20 },
  linkText: { fontSize: 14, color: '#666' },
});
