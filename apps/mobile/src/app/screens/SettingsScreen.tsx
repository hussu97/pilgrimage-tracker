import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Switch,
  Linking,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation';
import { getSettings, updateSettings } from '../../lib/api/client';
import { useI18n } from '../providers';
import { useTheme } from '../providers';
import type { UserSettings } from '../../lib/types';
import type { Theme } from '../../lib/theme';

const THEME_OPTIONS: { value: Theme; labelKey: string }[] = [
  { value: 'light', labelKey: 'settings.themeLight' },
  { value: 'dark', labelKey: 'settings.themeDark' },
  { value: 'system', labelKey: 'settings.themeSystem' },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Settings'>>();
  const { t, locale, setLocale, languages } = useI18n();
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getSettings();
      setSettings(s);
      if (s.theme && (s.theme === 'light' || s.theme === 'dark' || s.theme === 'system')) {
        setTheme(s.theme as Theme);
      }
    } catch {
      setSettings({});
    } finally {
      setLoading(false);
    }
  }, [setTheme]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleThemeChange = (value: Theme) => {
    setTheme(value);
    setSaving(true);
    updateSettings({ theme: value })
      .then(() => setSettings((s) => (s ? { ...s, theme: value } : { theme: value })))
      .catch(() => {})
      .finally(() => setSaving(false));
  };

  const handleLanguageChange = async (code: string) => {
    setSaving(true);
    try {
      await setLocale(code);
      await updateSettings({ language: code });
      setSettings((s) => (s ? { ...s, language: code } : { language: code }));
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleNotificationsToggle = (value: boolean) => {
    setSaving(true);
    updateSettings({ notifications_on: value })
      .then((s) => setSettings(s))
      .catch(() => {})
      .finally(() => setSaving(false));
  };

  const handleDeleteAccount = () => {
    setDeleteConfirm(false);
    Alert.alert(
      'Delete account',
      'Account deletion is not available. Please contact support.',
      [{ text: 'OK' }]
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        activeOpacity={0.8}
      >
        <Text style={styles.backText}>‹ {t('common.back')}</Text>
      </TouchableOpacity>
      <Text style={styles.sectionLabel}>Preferences</Text>
      <Text style={styles.title}>{t('settings.title')}</Text>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="small" color="#0d9488" />
          <Text style={styles.muted}>{t('common.loading')}</Text>
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.appearance')}</Text>
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>{t('settings.theme')}</Text>
              </View>
              <View style={styles.themeRow}>
                {THEME_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.themeBtn, theme === opt.value && styles.themeBtnActive]}
                    onPress={() => handleThemeChange(opt.value)}
                    disabled={saving}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.themeBtnText,
                        theme === opt.value && styles.themeBtnTextActive,
                      ]}
                    >
                      {t(opt.labelKey)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>{t('settings.language')}</Text>
              </View>
              <View style={styles.languageList}>
                {(languages.length > 0 ? languages : [{ code: 'en', name: 'English' }, { code: 'ar', name: 'العربية' }, { code: 'hi', name: 'हिन्दी' }]).map(
                  (lang) => (
                    <TouchableOpacity
                      key={lang.code}
                      style={[
                        styles.languageRow,
                        locale === lang.code && styles.languageRowActive,
                      ]}
                      onPress={() => handleLanguageChange(lang.code)}
                      disabled={saving}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.languageName,
                          locale === lang.code && styles.languageNameActive,
                        ]}
                      >
                        {lang.name}
                      </Text>
                      {locale === lang.code ? (
                        <Text style={styles.checkmark}>✓</Text>
                      ) : null}
                    </TouchableOpacity>
                  )
                )}
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.preferences')}</Text>
            <View style={styles.card}>
              <View style={styles.switchRow}>
                <Text style={styles.cardLabel}>{t('settings.notifications')}</Text>
                <Switch
                  value={settings?.notifications_on ?? true}
                  onValueChange={handleNotificationsToggle}
                  disabled={saving}
                  trackColor={{ false: '#e5e7eb', true: '#0d9488' }}
                  thumbColor="#fff"
                />
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Support</Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => Linking.openURL('#about').catch(() => {})}
                activeOpacity={0.8}
              >
                <Text style={styles.linkRowText}>{t('settings.about')}</Text>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => Linking.openURL('#terms').catch(() => {})}
                activeOpacity={0.8}
              >
                <Text style={styles.linkRowText}>{t('settings.termsOfService')}</Text>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>
            <View style={styles.card}>
              {!deleteConfirm ? (
                <TouchableOpacity
                  style={styles.deleteRow}
                  onPress={() => setDeleteConfirm(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.deleteRowText}>Delete account</Text>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.deleteConfirm}>
                  <Text style={styles.deleteConfirmText}>
                    Delete your account and all data? This cannot be undone. If not implemented on the backend, contact support.
                  </Text>
                  <View style={styles.deleteConfirmActions}>
                    <TouchableOpacity
                      style={styles.deleteCancelBtn}
                      onPress={() => setDeleteConfirm(false)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.deleteCancelBtnText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteConfirmBtn}
                      onPress={handleDeleteAccount}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.deleteConfirmBtnText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  content: { paddingHorizontal: 24 },
  backButton: { marginBottom: 16 },
  backText: { fontSize: 16, color: '#6b7280' },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0d9488',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#111', marginBottom: 20 },
  loaderWrap: { alignItems: 'center', paddingVertical: 24 },
  muted: { fontSize: 14, color: '#6b7280', marginTop: 8 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  cardRow: { paddingHorizontal: 16, paddingTop: 14 },
  cardLabel: { fontSize: 14, fontWeight: '500', color: '#374151' },
  themeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16, paddingTop: 8 },
  themeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  themeBtnActive: { backgroundColor: '#0d9488', borderColor: '#0d9488' },
  themeBtnText: { fontSize: 14, fontWeight: '500', color: '#6b7280' },
  themeBtnTextActive: { color: '#fff' },
  languageList: { padding: 16, paddingTop: 4 },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#f9fafb',
  },
  languageRowActive: { backgroundColor: 'rgba(13, 148, 136, 0.1)' },
  languageName: { fontSize: 15, color: '#374151' },
  languageNameActive: { fontWeight: '600', color: '#0d9488' },
  checkmark: { color: '#0d9488', fontWeight: '700' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  linkRowText: { fontSize: 15, color: '#111' },
  chevron: { fontSize: 18, color: '#9ca3af' },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  deleteRowText: { fontSize: 15, color: '#c00', fontWeight: '500' },
  deleteConfirm: { padding: 16 },
  deleteConfirmText: { fontSize: 14, color: '#6b7280', marginBottom: 12 },
  deleteConfirmActions: { flexDirection: 'row', gap: 12 },
  deleteCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  deleteCancelBtnText: { color: '#374151', fontWeight: '600' },
  deleteConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#c00',
    alignItems: 'center',
  },
  deleteConfirmBtnText: { color: '#fff', fontWeight: '600' },
});
