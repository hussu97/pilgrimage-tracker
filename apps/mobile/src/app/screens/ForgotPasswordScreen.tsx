import { useState } from 'react';
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
import { useI18n } from '@/app/providers';
import { forgotPassword } from '@/lib/api/client';
import { tokens } from '@/lib/theme';

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'ForgotPassword'>>();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      await forgotPassword(email);
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
          placeholderTextColor={tokens.colors.textMuted}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.backgroundLight },
  content: { paddingHorizontal: 24, flexGrow: 1 },
  successContainer: {
    flex: 1,
    backgroundColor: tokens.colors.backgroundLight,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  successIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successIcon: { fontSize: 28, color: '#059669' },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  backIcon: { fontSize: 24, color: '#334155', lineHeight: 28 },
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
  title: { fontSize: 24, fontWeight: '700', color: tokens.colors.textDark, marginBottom: 4 },
  subtitle: { fontSize: 14, color: tokens.colors.textMuted, marginBottom: 24, lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    borderRadius: tokens.borderRadius['2xl'],
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: tokens.colors.surface,
    color: tokens.colors.textMain,
  },
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
  secondaryLinkText: { fontSize: 14, color: tokens.colors.textMuted },
  linkButton: { marginTop: 8 },
  linkText: { fontSize: 16, color: tokens.colors.primary, fontWeight: '600' },
});
