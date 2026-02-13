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
import type { RootStackParamList } from '../navigation';
import { useAuth } from '../providers';
import { useI18n } from '../providers';
import { tokens } from '../../lib/theme';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Login'>>();
  const { login } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await login(email, password);
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
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t('auth.login')}</Text>
        <Text style={styles.subtitle}>{t('auth.loginWelcome')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholderTextColor={tokens.colors.textMuted}
        />
        <TextInput
          style={styles.input}
          placeholder={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholderTextColor={tokens.colors.textMuted}
        />
        <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} style={styles.forgotLink}>
          <Text style={styles.forgotText}>{t('auth.forgotPassword')}</Text>
        </TouchableOpacity>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>{loading ? t('common.loading') : t('auth.login')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.secondaryLink}>
          <Text style={styles.secondaryLinkText}>{t('auth.createAccount')}</Text>
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
  forgotLink: { alignSelf: 'flex-start', marginBottom: 16 },
  forgotText: { fontSize: 14, color: tokens.colors.primary },
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
});
