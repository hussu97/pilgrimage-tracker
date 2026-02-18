import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
} from '@gorhom/bottom-sheet';
import { useAuth, useI18n, useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';

// ─── Context ──────────────────────────────────────────────────────────────────

interface AuthGateContextValue {
  openAuthGate: (callback: () => void, promptKey?: string) => void;
}

const AuthGateContext = createContext<AuthGateContextValue | null>(null);

export function useAuthGate(): AuthGateContextValue {
  const ctx = useContext(AuthGateContext);
  if (!ctx) throw new Error('useAuthGate must be used within AuthBottomSheetProvider');
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthBottomSheetProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const pendingCallback = useRef<(() => void) | null>(null);
  const wasWaitingForAuth = useRef(false);
  const [promptKey, setPromptKey] = useState<string | undefined>();
  const snapPoints = useMemo(() => ['75%', '90%'], []);

  // When user becomes truthy after waiting for auth, call the pending callback
  useEffect(() => {
    if (user && wasWaitingForAuth.current) {
      wasWaitingForAuth.current = false;
      const cb = pendingCallback.current;
      pendingCallback.current = null;
      bottomSheetRef.current?.dismiss();
      if (cb) cb();
    }
  }, [user]);

  const openAuthGate = useCallback((callback: () => void, key?: string) => {
    if (user) {
      callback();
      return;
    }
    pendingCallback.current = callback;
    wasWaitingForAuth.current = true;
    setPromptKey(key);
    bottomSheetRef.current?.present();
  }, [user]);

  const handleDismiss = useCallback(() => {
    wasWaitingForAuth.current = false;
    pendingCallback.current = null;
  }, []);

  return (
    <AuthGateContext.Provider value={{ openAuthGate }}>
      {children}
      <BottomSheetModal
        ref={bottomSheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose
        onDismiss={handleDismiss}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
        )}
      >
        <BottomSheetView style={{ flex: 1 }}>
          <AuthSheetContent promptKey={promptKey} onClose={() => bottomSheetRef.current?.dismiss()} />
        </BottomSheetView>
      </BottomSheetModal>
    </AuthGateContext.Provider>
  );
}

// ─── Sheet Content ────────────────────────────────────────────────────────────

type Tab = 'login' | 'register';

function AuthSheetContent({
  promptKey,
  onClose,
}: {
  promptKey?: string;
  onClose: () => void;
}) {
  const { login, register } = useAuth();
  const { t } = useI18n();
  const { isDark } = useTheme();
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  function resetForm() {
    setEmail('');
    setPassword('');
    setDisplayName('');
    setConfirm('');
    setError('');
    setSubmitting(false);
  }

  async function handleLogin() {
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      resetForm();
      // sheet will be dismissed by the useEffect in AuthBottomSheetProvider
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.loginFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister() {
    setError('');
    if (password !== confirm) { setError(t('auth.passwordsDoNotMatch')); return; }
    if (password.length < 6) { setError(t('auth.passwordMinLength')); return; }
    setSubmitting(true);
    try {
      await register(email, password, displayName.trim() || undefined);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.registrationFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Prompt */}
      {promptKey && (
        <View style={styles.prompt}>
          <Text style={styles.promptTitle}>{t(promptKey)}</Text>
          <Text style={styles.promptDesc}>{t('visitor.loginRequiredDesc')}</Text>
        </View>
      )}

      {/* Tab switcher */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'login' && styles.tabActive]}
          onPress={() => { setTab('login'); setError(''); }}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, tab === 'login' && styles.tabTextActive]}>
            {t('auth.login')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'register' && styles.tabActive]}
          onPress={() => { setTab('register'); setError(''); }}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, tab === 'register' && styles.tabTextActive]}>
            {t('auth.register')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Form */}
      {tab === 'login' ? (
        <View style={styles.form}>
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
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity
            style={[styles.primaryButton, submitting && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>{t('auth.login')}</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder={t('auth.fullName')}
            value={displayName}
            onChangeText={setDisplayName}
            placeholderTextColor={tokens.colors.textMuted}
          />
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
            style={[styles.primaryButton, submitting && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>{t('auth.register')}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function makeStyles(isDark: boolean) {
  const bg = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const textPrimary = isDark ? '#ffffff' : tokens.colors.textDark;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: bg,
      paddingHorizontal: 24,
      paddingTop: 8,
      paddingBottom: 32,
    },
    prompt: {
      backgroundColor: isDark ? '#1e2a3a' : '#eff6ff',
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? '#2a3f5c' : '#bfdbfe',
    },
    promptTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: tokens.colors.primary,
      marginBottom: 2,
    },
    promptDesc: {
      fontSize: 12,
      color: textMuted,
    },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: isDark ? tokens.colors.darkBorder : '#f1f5f9',
      borderRadius: 12,
      padding: 4,
      marginBottom: 20,
    },
    tab: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: 'center',
    },
    tabActive: {
      backgroundColor: bg,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 2,
      elevation: 2,
    },
    tabText: {
      fontSize: 14,
      fontWeight: '500',
      color: textMuted,
    },
    tabTextActive: {
      color: textPrimary,
      fontWeight: '600',
    },
    form: {
      gap: 12,
    },
    input: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: tokens.borderRadius['2xl'],
      padding: 14,
      fontSize: 15,
      backgroundColor: isDark ? tokens.colors.darkBg : '#fff',
      color: textPrimary,
    },
    error: {
      color: '#dc2626',
      fontSize: 13,
      fontWeight: '500',
    },
    primaryButton: {
      backgroundColor: tokens.colors.primary,
      paddingVertical: 15,
      borderRadius: tokens.borderRadius['2xl'],
      alignItems: 'center',
      marginTop: 4,
    },
    buttonDisabled: { opacity: 0.6 },
    primaryButtonText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '600',
    },
  });
}
