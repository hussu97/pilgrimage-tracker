import { useState, useMemo } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/app/navigation';
import { useAuth, useI18n, useTheme } from '@/app/providers';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { useAds } from '@/components/ads/AdProvider';
import { useUmamiTracking } from '@/lib/hooks/useUmamiTracking';
import { tokens } from '@/lib/theme';

function makeStyles(isDark: boolean) {
  const bg = isDark ? tokens.colors.darkBg : tokens.colors.backgroundLight;
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const inputText = isDark ? '#ffffff' : tokens.colors.textMain;
  const backBtnBg = isDark ? 'rgba(255,255,255,0.1)' : '#F1F5F9';

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: bg },
    content: { paddingHorizontal: 24, flexGrow: 1 },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: backBtnBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 28,
    },
    logoIconContainer: {
      width: 56,
      height: 56,
      borderRadius: tokens.borderRadius['2xl'],
      backgroundColor: `${tokens.colors.primary}1A`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    title: { fontSize: 24, fontWeight: '700', color: textMain, marginBottom: 4 },
    subtitle: { fontSize: 14, color: textMuted, marginBottom: 24 },
    input: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: tokens.borderRadius['2xl'],
      padding: 14,
      marginBottom: 12,
      fontSize: 16,
      backgroundColor: surface,
      color: inputText,
    },
    forgotLink: { alignSelf: 'flex-end', marginBottom: 20 },
    forgotText: { fontSize: 14, color: tokens.colors.primary, fontWeight: '500' },
    error: { color: '#dc2626', fontSize: 14, marginBottom: 12, fontWeight: '500' },
    primaryButton: {
      backgroundColor: tokens.colors.primary,
      paddingVertical: 16,
      borderRadius: tokens.borderRadius['2xl'],
      alignItems: 'center',
      marginTop: 4,
    },
    buttonDisabled: { opacity: 0.6 },
    primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    secondaryLink: { marginTop: 24, alignItems: 'center' },
    secondaryLinkText: { fontSize: 14, color: textMuted },
  });
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Login'>>();
  const { login } = useAuth();
  const { t } = useI18n();
  const { isDark } = useTheme();
  const { trackEvent } = useAnalytics();
  const { consent } = useAds();
  const { trackUmamiEvent } = useUmamiTracking('Login', consent.analytics);
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      trackEvent('login');
      trackUmamiEvent('login');
      navigation.replace('Main');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back button */}
        <TouchableOpacity
          onPress={() =>
            navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main')
          }
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back" size={20} color={isDark ? '#ffffff' : '#334155'} />
        </TouchableOpacity>

        {/* Logo icon */}
        <Image
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require('@/../assets/icon.png') as number}
          style={{ width: 56, height: 56, borderRadius: 16, marginBottom: 20 }}
        />

        <Text style={styles.title}>{t('auth.login')}</Text>
        <Text style={styles.subtitle}>{t('auth.loginWelcome')}</Text>

        <TextInput
          style={styles.input}
          placeholder={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholderTextColor={isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted}
        />
        <TextInput
          style={styles.input}
          placeholder={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholderTextColor={isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted}
        />
        <TouchableOpacity
          onPress={() => navigation.navigate('ForgotPassword')}
          style={styles.forgotLink}
        >
          <Text style={styles.forgotText}>{t('auth.forgotPassword')}</Text>
        </TouchableOpacity>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? t('common.loading') : t('auth.login')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('Register')}
          style={styles.secondaryLink}
        >
          <Text style={styles.secondaryLinkText}>{t('auth.createAccount')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
