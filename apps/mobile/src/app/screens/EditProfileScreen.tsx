import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation';
import { useAuth } from '../providers';
import { useI18n } from '../providers';
import { updateMe, updateSettings } from '../../lib/api/client';
import type { Religion } from '../../lib/types';
import { tokens } from '../../lib/theme';

const RELIGIONS: Religion[] = ['islam', 'hinduism', 'christianity'];

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'EditProfile'>>();
  const { user, refreshUser } = useAuth();
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [religions, setReligions] = useState<Religion[]>(user?.religions ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleReligion = (r: Religion) => {
    setReligions((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      await updateMe({
        display_name: displayName.trim() || user.display_name,
      });
      await updateSettings({ religions });
      await refreshUser();
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        activeOpacity={0.8}
      >
        <Text style={styles.backText}>‹ {t('common.back')}</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{t('profile.editProfile')}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.label}>{t('auth.displayName')}</Text>
      <TextInput
        style={styles.input}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder={t('auth.displayName')}
        placeholderTextColor={tokens.colors.textMuted}
      />

      <Text style={[styles.label, { marginTop: 20 }]}>{t('settings.religionsToShow')}</Text>
      {RELIGIONS.map((r) => (
        <TouchableOpacity
          key={r}
          style={[styles.religionRow, religions.includes(r) && styles.religionRowSelected]}
          onPress={() => toggleReligion(r)}
          activeOpacity={0.8}
        >
          <Text style={[styles.religionLabel, religions.includes(r) && styles.religionLabelSelected]}>
            {t(`common.${r}`)}
          </Text>
          {religions.includes(r) ? <Text style={styles.check}>✓</Text> : null}
        </TouchableOpacity>
      ))}
      <Text style={styles.hint}>{t('selectPath.hint')}</Text>

      <View style={styles.buttons}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color={tokens.colors.surface} size="small" />
          ) : (
            <Text style={styles.saveText}>{t('common.save')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.surface },
  content: { paddingHorizontal: 24 },
  backButton: { marginBottom: 16 },
  backText: { fontSize: 16, color: tokens.colors.textMuted },
  title: { fontSize: 22, fontWeight: '700', color: tokens.colors.textDark, marginBottom: 20 },
  error: { color: '#b91c1c', marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', color: tokens.colors.textMain, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    borderRadius: tokens.borderRadius.xl,
    padding: 14,
    fontSize: 16,
    backgroundColor: tokens.colors.backgroundLight,
    color: tokens.colors.textMain,
  },
  religionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: tokens.borderRadius.xl,
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    backgroundColor: tokens.colors.backgroundLight,
    marginBottom: 8,
  },
  religionRowSelected: { borderColor: tokens.colors.primary, backgroundColor: tokens.colors.blueTint },
  religionLabel: { fontSize: 16, color: tokens.colors.textMain },
  religionLabelSelected: { color: tokens.colors.primary, fontWeight: '600' },
  check: { fontSize: 18, color: tokens.colors.primary },
  hint: { fontSize: 12, color: tokens.colors.textMuted, marginTop: 8 },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 28 },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: tokens.borderRadius.xl,
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    alignItems: 'center',
  },
  cancelText: { fontSize: 16, fontWeight: '600', color: tokens.colors.textMain },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: tokens.borderRadius.xl,
    backgroundColor: tokens.colors.primary,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
