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
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/app/navigation';
import { useI18n } from '@/app/providers';
import { resetPassword } from '@/lib/api/client';
import { tokens } from '@/lib/theme';

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'ResetPassword'>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ResetPassword'>>();
  const token = route.params?.token ?? '';
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!token) {
      setError(t('errors.missingToken'));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }
    if (password.length < 6) {
      setError(t('auth.passwordMinLength'));
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => navigation.navigate('Login'), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.invalidOrExpiredToken'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View
        style={[
          styles.container,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingHorizontal: 24 },
        ]}
      >
        <Text style={styles.title}>{t('auth.passwordUpdated')}</Text>
        <Text style={styles.subtitle}>{t('auth.backToLogin')}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>{t('auth.login')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!token) {
    return (
      <View
        style={[
          styles.container,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingHorizontal: 24 },
        ]}
      >
        <Text style={styles.error}>{t('errors.missingToken')}</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('ForgotPassword')}
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>{t('auth.sendResetLink')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t('auth.setNewPassword')}</Text>
        <Text style={styles.subtitle}>{t('auth.enterNewPassword')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('auth.newPassword')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholderTextColor={tokens.colors.textMuted}
        />
        <TextInput
          style={styles.input}
          placeholder={t('auth.confirmPassword')}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          placeholderTextColor={tokens.colors.textMuted}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>
            {loading ? t('common.loading') : t('auth.resetPassword')}
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
  container: { flex: 1, backgroundColor: tokens.colors.surface },
  scrollContent: { paddingHorizontal: 24, flexGrow: 1 },
  title: { fontSize: 24, fontWeight: '700', color: tokens.colors.textMain, marginBottom: 8 },
  subtitle: { fontSize: 16, color: tokens.colors.textMuted, marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    borderRadius: tokens.borderRadius.xl,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: tokens.colors.backgroundLight,
    color: tokens.colors.textMain,
  },
  error: { color: '#b91c1c', fontSize: 14, marginBottom: 12 },
  button: {
    backgroundColor: tokens.colors.primary,
    paddingVertical: 14,
    borderRadius: tokens.borderRadius.xl,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryLink: { marginTop: 24, alignItems: 'center' },
  secondaryLinkText: { fontSize: 14, color: tokens.colors.textMuted },
  linkButton: { marginTop: 16 },
  linkText: { fontSize: 16, color: tokens.colors.primary, fontWeight: '500' },
});
