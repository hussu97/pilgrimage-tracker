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
        placeholderTextColor="#9ca3af"
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
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveText}>{t('common.save')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { paddingHorizontal: 24 },
  backButton: { marginBottom: 16 },
  backText: { fontSize: 16, color: '#6b7280' },
  title: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 20 },
  error: { color: '#c00', marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  religionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fafafa',
    marginBottom: 8,
  },
  religionRowSelected: { borderColor: '#0d9488', backgroundColor: 'rgba(13, 148, 136, 0.05)' },
  religionLabel: { fontSize: 16, color: '#374151' },
  religionLabelSelected: { color: '#0d9488', fontWeight: '600' },
  check: { fontSize: 18, color: '#0d9488' },
  hint: { fontSize: 12, color: '#6b7280', marginTop: 8 },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 28 },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  cancelText: { fontSize: 16, fontWeight: '600', color: '#374151' },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0d9488',
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
