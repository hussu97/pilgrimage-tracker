import { useState, useEffect, useMemo } from 'react';
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
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/app/navigation';
import { useAuth, useI18n, useTheme } from '@/app/providers';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { getFieldRules } from '@/lib/api/client';
import type { PasswordRule } from '@/lib/api/client';
import { tokens } from '@/lib/theme';

function checkRule(rule: PasswordRule, password: string): boolean {
  switch (rule.type) {
    case 'min_length':
      return password.length >= (rule.value ?? 8);
    case 'require_uppercase':
      return /[A-Z]/.test(password);
    case 'require_lowercase':
      return /[a-z]/.test(password);
    case 'require_digit':
      return /\d/.test(password);
    default:
      return true;
  }
}

function ruleKey(rule: PasswordRule): string {
  switch (rule.type) {
    case 'min_length':
      return 'auth.passwordRuleMinLength';
    case 'require_uppercase':
      return 'auth.passwordRuleUppercase';
    case 'require_lowercase':
      return 'auth.passwordRuleLowercase';
    case 'require_digit':
      return 'auth.passwordRuleDigit';
    default:
      return '';
  }
}

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
    rulesContainer: { marginBottom: 12, marginTop: -4, paddingHorizontal: 4 },
    ruleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    ruleIcon: { fontSize: 12, color: textMuted, marginRight: 6, width: 14 },
    ruleIconMet: { color: tokens.colors.openNow },
    ruleText: { fontSize: 11, color: textMuted },
    ruleTextMet: { color: tokens.colors.openNow },
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

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Register'>>();
  const { register } = useAuth();
  const { t } = useI18n();
  const { isDark } = useTheme();
  const { trackEvent } = useAnalytics();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordRules, setPasswordRules] = useState<PasswordRule[]>([]);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    getFieldRules()
      .then((data) => {
        const pwField = data.fields.find((f) => f.name === 'password');
        if (pwField) setPasswordRules(pwField.rules);
      })
      .catch(() => {
        // Fallback to default rules if endpoint fails
        setPasswordRules([
          { type: 'min_length', value: 8 },
          { type: 'require_uppercase' },
          { type: 'require_lowercase' },
          { type: 'require_digit' },
        ]);
      });
  }, []);

  const minLength = passwordRules.find((r) => r.type === 'min_length')?.value ?? 8;

  const handleRegister = async () => {
    setError('');
    if (password !== confirm) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }
    if (password.length < minLength) {
      setError(t('auth.passwordMinLength'));
      return;
    }
    setLoading(true);
    try {
      await register(email, password, displayName.trim() || undefined);
      trackEvent('signup');
      navigation.replace('Main');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.registrationFailed'));
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
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          onPress={() =>
            navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Login')
          }
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back" size={20} color={isDark ? '#ffffff' : '#334155'} />
        </TouchableOpacity>

        <View style={styles.logoIconContainer}>
          <MaterialIcons name="auto-awesome" size={24} color={tokens.colors.primary} />
        </View>

        <Text style={styles.title}>{t('auth.registerTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.registerSubtitle')}</Text>

        <TextInput
          style={styles.input}
          placeholder={t('auth.fullName')}
          value={displayName}
          onChangeText={setDisplayName}
          placeholderTextColor={isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted}
        />
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
          onFocus={() => setShowRules(true)}
        />

        {/* Dynamic password rules */}
        {showRules && passwordRules.length > 0 && (
          <View style={styles.rulesContainer}>
            {passwordRules.map((rule) => {
              const met = password.length > 0 && checkRule(rule, password);
              const label = t(ruleKey(rule)).replace(
                '{count}',
                String(rule.type === 'min_length' ? (rule.value ?? 8) : ''),
              );
              return (
                <View key={rule.type} style={styles.ruleRow}>
                  <Text style={[styles.ruleIcon, met && styles.ruleIconMet]}>
                    {met ? '✓' : '○'}
                  </Text>
                  <Text style={[styles.ruleText, met && styles.ruleTextMet]}>{label}</Text>
                </View>
              );
            })}
          </View>
        )}

        <TextInput
          style={styles.input}
          placeholder={t('auth.confirmPassword')}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          placeholderTextColor={isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? t('common.loading') : t('auth.register')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.secondaryLink}>
          <Text style={styles.secondaryLinkText}>{t('auth.alreadyHaveAccount')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
