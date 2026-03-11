import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/app/navigation';
import { useI18n, useTheme } from '@/app/providers';
import { forgotPassword } from '@/lib/api/client';
import { useAds } from '@/components/ads/AdProvider';
import { useUmamiTracking } from '@/lib/hooks/useUmamiTracking';
import { tokens } from '@/lib/theme';

function makeStyles(isDark: boolean) {
  const bg = isDark ? tokens.colors.darkBg : tokens.colors.backgroundLight;
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const textDark = isDark ? '#ffffff' : tokens.colors.textDark;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  const inputText = isDark ? '#ffffff' : tokens.colors.textMain;
  const backBtnBg = isDark ? 'rgba(255,255,255,0.1)' : tokens.colors.silverLight;
  const backIconColor = isDark ? '#ffffff' : tokens.colors.navIconLight;
  const successIconBg = isDark ? 'rgba(16,185,129,0.2)' : '#D1FAE5';

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: bg },
    content: { paddingHorizontal: 24, flexGrow: 1 },
    successContainer: {
      flex: 1,
      backgroundColor: bg,
      paddingHorizontal: 24,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    successIconContainer: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: successIconBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    successIcon: { fontSize: 28, color: '#059669' },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: backBtnBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 28,
    },
    backIcon: { fontSize: 24, color: backIconColor, lineHeight: 28 },
    keyIconContainer: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: `${tokens.colors.primary}1A`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    keyIconText: { fontSize: 24 },
    title: { fontSize: 24, fontWeight: '700', color: textDark, marginBottom: 4 },
    subtitle: { fontSize: 14, color: textMuted, marginBottom: 24, lineHeight: 20 },
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
    error: { color: tokens.colors.error, fontSize: 14, marginBottom: 12, fontWeight: '500' },
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
    linkButton: { marginTop: 8 },
    linkText: { fontSize: 16, color: tokens.colors.primary, fontWeight: '600' },
  });
}

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'ForgotPassword'>>();
  const { t } = useI18n();
  const { isDark } = useTheme();
  const { consent } = useAds();
  const { trackUmamiEvent } = useUmamiTracking('ForgotPassword', consent.analytics);
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      await forgotPassword(email);
      trackUmamiEvent('forgot_password');
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View
        style={[
          styles.successContainer,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <View style={styles.successIconContainer}>
          <Text style={styles.successIcon}>✓</Text>
        </View>
        <Text style={[styles.title, { textAlign: 'center' }]}>{t('auth.checkEmail')}</Text>
        <Text style={[styles.subtitle, { textAlign: 'center' }]}>{t('auth.resetLinkSent')}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.linkButton}>
          <Text style={styles.linkText}>{t('auth.backToLogin')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>

        <View style={styles.keyIconContainer}>
          <Text style={styles.keyIconText}>🔑</Text>
        </View>

        <Text style={styles.title}>{t('auth.resetPassword')}</Text>
        <Text style={styles.subtitle}>{t('auth.enterNewPassword')}</Text>

        <TextInput
          style={styles.input}
          placeholder={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholderTextColor={isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? t('common.loading') : t('auth.sendResetLink')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.secondaryLink}>
          <Text style={styles.secondaryLinkText}>{t('auth.backToLogin')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
