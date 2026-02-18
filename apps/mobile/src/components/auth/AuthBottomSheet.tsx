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
  Modal,
  Animated,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthBottomSheetProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [promptKey, setPromptKey] = useState<string | undefined>();
  const pendingCallback = useRef<(() => void) | null>(null);
  const wasWaitingForAuth = useRef(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const openSheet = useCallback(() => {
    setVisible(true);
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();
  }, [slideAnim]);

  const closeSheet = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setVisible(false));
    wasWaitingForAuth.current = false;
    pendingCallback.current = null;
  }, [slideAnim]);

  useEffect(() => {
    if (user && wasWaitingForAuth.current) {
      wasWaitingForAuth.current = false;
      const cb = pendingCallback.current;
      pendingCallback.current = null;
      closeSheet();
      if (cb) cb();
    }
  }, [user, closeSheet]);

  const openAuthGate = useCallback((callback: () => void, key?: string) => {
    if (user) {
      callback();
      return;
    }
    pendingCallback.current = callback;
    wasWaitingForAuth.current = true;
    setPromptKey(key);
    openSheet();
  }, [user, openSheet]);

  return (
    <AuthGateContext.Provider value={{ openAuthGate }}>
      {children}
      <AuthSheetModal
        visible={visible}
        slideAnim={slideAnim}
        promptKey={promptKey}
        onClose={closeSheet}
      />
    </AuthGateContext.Provider>
  );
}

// ─── Modal wrapper with slide-up animation ────────────────────────────────────

const SHEET_HEIGHT = 520;

function AuthSheetModal({
  visible,
  slideAnim,
  promptKey,
  onClose,
}: {
  visible: boolean;
  slideAnim: Animated.Value;
  promptKey?: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SHEET_HEIGHT, 0],
  });

  const bgOpacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });

  const bg = isDark ? tokens.colors.darkSurface : tokens.colors.surface;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Dim backdrop */}
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: bgOpacity }]}
          pointerEvents="box-none"
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        {/* Sheet */}
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Animated.View
            style={[
              sheetStyles.sheet,
              { backgroundColor: bg, paddingBottom: insets.bottom + 16 },
              { transform: [{ translateY }] },
            ]}
          >
            <View style={sheetStyles.handle} />
            <AuthSheetContent promptKey={promptKey} onClose={onClose} />
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.colors.inputBorder,
    alignSelf: 'center',
    marginBottom: 20,
  },
});

// ─── Sheet Content ─────────────────────────────────────────────────────────────

type Tab = 'login' | 'register';

function AuthSheetContent({
  promptKey,
  onClose: _onClose,
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
      // sheet dismissed by the useEffect watching user in AuthBottomSheetProvider
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
      {promptKey ? (
        <View style={styles.prompt}>
          <Text style={styles.promptTitle}>{t(promptKey)}</Text>
          <Text style={styles.promptDesc}>{t('visitor.loginRequiredDesc')}</Text>
        </View>
      ) : null}

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

      {/* Forms */}
      {tab === 'login' ? (
        <View style={styles.form}>
          <TextInput style={styles.input} placeholder={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholderTextColor={tokens.colors.textMuted} />
          <TextInput style={styles.input} placeholder={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor={tokens.colors.textMuted} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity style={[styles.primaryButton, submitting && styles.buttonDisabled]} onPress={handleLogin} disabled={submitting} activeOpacity={0.85}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t('auth.login')}</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.form}>
          <TextInput style={styles.input} placeholder={t('auth.fullName')} value={displayName} onChangeText={setDisplayName} placeholderTextColor={tokens.colors.textMuted} />
          <TextInput style={styles.input} placeholder={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholderTextColor={tokens.colors.textMuted} />
          <TextInput style={styles.input} placeholder={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor={tokens.colors.textMuted} />
          <TextInput style={styles.input} placeholder={t('auth.confirmPassword')} value={confirm} onChangeText={setConfirm} secureTextEntry placeholderTextColor={tokens.colors.textMuted} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity style={[styles.primaryButton, submitting && styles.buttonDisabled]} onPress={handleRegister} disabled={submitting} activeOpacity={0.85}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t('auth.register')}</Text>}
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
    container: { paddingBottom: 8 },
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
    promptDesc: { fontSize: 12, color: textMuted },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: isDark ? tokens.colors.darkBorder : '#f1f5f9',
      borderRadius: 12,
      padding: 4,
      marginBottom: 20,
    },
    tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
    tabActive: {
      backgroundColor: bg,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 2,
      elevation: 2,
    },
    tabText: { fontSize: 14, fontWeight: '500', color: textMuted },
    tabTextActive: { color: textPrimary, fontWeight: '600' },
    form: { gap: 12 },
    input: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: tokens.borderRadius['2xl'],
      padding: 14,
      fontSize: 15,
      backgroundColor: isDark ? tokens.colors.darkBg : '#fff',
      color: textPrimary,
    },
    error: { color: '#dc2626', fontSize: 13, fontWeight: '500' },
    primaryButton: {
      backgroundColor: tokens.colors.primary,
      paddingVertical: 15,
      borderRadius: tokens.borderRadius['2xl'],
      alignItems: 'center',
      marginTop: 4,
    },
    buttonDisabled: { opacity: 0.6 },
    primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  });
}
