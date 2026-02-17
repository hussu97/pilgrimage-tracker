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
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/app/navigation';
import { useAuth, useI18n } from '@/app/providers';
import { tokens } from '@/lib/theme';
import * as api from '@/lib/api/client';

type ReligionChip = 'all' | 'islam' | 'hinduism' | 'christianity';

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Register'>>();
  const { register } = useAuth();
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [selectedReligion, setSelectedReligion] = useState<ReligionChip>('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const religionChips: ReligionChip[] = ['all', 'islam', 'hinduism', 'christianity'];

  const handleRegister = async () => {
    setError('');
    if (password !== confirm) { setError(t('auth.passwordsDoNotMatch')); return; }
    if (password.length < 6) { setError(t('auth.passwordMinLength')); return; }
    setLoading(true);
    try {
      await register(email, password, displayName.trim() || undefined);
      if (selectedReligion !== 'all') {
        await api.updateSettings({ religions: [selectedReligion] }).catch(() => {});
      }
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
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.7}>
          <MaterialIcons name="arrow-back" size={20} color="#334155" />
        </TouchableOpacity>

        <View style={styles.logoIconContainer}>
          <MaterialIcons name="auto-awesome" size={24} color={tokens.colors.primary} />
        </View>

        <Text style={styles.title}>{t('auth.registerTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.registerSubtitle')}</Text>

        <TextInput style={styles.input} placeholder={t('auth.fullName')} value={displayName} onChangeText={setDisplayName} placeholderTextColor={tokens.colors.textMuted} />
        <TextInput style={styles.input} placeholder={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholderTextColor={tokens.colors.textMuted} />
        <TextInput style={styles.input} placeholder={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor={tokens.colors.textMuted} />
        <Text style={styles.passwordHint}>{t('auth.passwordMinLength')}</Text>
        <TextInput style={styles.input} placeholder={t('auth.confirmPassword')} value={confirm} onChangeText={setConfirm} secureTextEntry placeholderTextColor={tokens.colors.textMuted} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipContainer}>
          {religionChips.map((chip) => (
            <TouchableOpacity key={chip} onPress={() => setSelectedReligion(chip)} style={[styles.chip, selectedReligion === chip && styles.chipActive]} activeOpacity={0.7}>
              <Text style={[styles.chipText, selectedReligion === chip && styles.chipTextActive]}>{t(`register.religionChip.${chip}`)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={[styles.primaryButton, loading && styles.buttonDisabled]} onPress={handleRegister} disabled={loading} activeOpacity={0.85}>
          <Text style={styles.primaryButtonText}>{loading ? t('common.loading') : t('auth.register')}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.secondaryLink}>
          <Text style={styles.secondaryLinkText}>{t('auth.alreadyHaveAccount')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.backgroundLight },
  content: { paddingHorizontal: 24, flexGrow: 1 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  logoIconContainer: { width: 56, height: 56, borderRadius: tokens.borderRadius['2xl'], backgroundColor: `${tokens.colors.primary}1A`, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '700', color: tokens.colors.textDark, marginBottom: 4 },
  subtitle: { fontSize: 14, color: tokens.colors.textMuted, marginBottom: 24 },
  input: { borderWidth: 1, borderColor: tokens.colors.inputBorder, borderRadius: tokens.borderRadius['2xl'], padding: 14, marginBottom: 12, fontSize: 16, backgroundColor: tokens.colors.surface, color: tokens.colors.textMain },
  passwordHint: { fontSize: 11, color: tokens.colors.textMuted, marginBottom: 4, marginLeft: 4 },
  chipScroll: { marginBottom: 16 },
  chipContainer: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: tokens.borderRadius.full, borderWidth: 1, borderColor: tokens.colors.inputBorder, backgroundColor: tokens.colors.surface },
  chipActive: { backgroundColor: tokens.colors.primary, borderColor: tokens.colors.primary },
  chipText: { fontSize: 14, color: tokens.colors.textSecondary, fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  error: { color: '#dc2626', fontSize: 14, marginBottom: 12, fontWeight: '500' },
  primaryButton: { backgroundColor: tokens.colors.primary, paddingVertical: 16, borderRadius: tokens.borderRadius['2xl'], alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryLink: { marginTop: 24, alignItems: 'center' },
  secondaryLinkText: { fontSize: 14, color: tokens.colors.textMuted },
});
