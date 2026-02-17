import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createGroup } from '@/lib/api/client';
import { shareUrl } from '@/lib/share';
import { INVITE_LINK_BASE_URL } from '@/lib/constants';
import { useI18n } from '@/app/providers';
import type { RootStackParamList } from '@/app/navigation';
import { tokens } from '@/lib/theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'CreateGroup'>;

export default function CreateGroupScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [groupCode, setGroupCode] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const g = await createGroup({
        name: name.trim(),
        description: description.trim() || undefined,
        is_private: isPrivate,
      });
      setInviteCode(g.invite_code);
      setGroupCode(g.group_code);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const inviteMessage = inviteCode
    ? INVITE_LINK_BASE_URL
      ? `${INVITE_LINK_BASE_URL}/join?code=${inviteCode}`
      : `Join my pilgrimage group with code: ${inviteCode}`
    : '';

  const handleShare = async () => {
    if (inviteMessage) await shareUrl(t('groups.createGroup'), inviteMessage);
  };

  const handleGoToGroup = () => {
    if (groupCode) {
      navigation.replace('GroupDetail', { groupCode });
    }
  };

  if (inviteCode && groupCode) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.successContent, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Text style={styles.backText}>‹ {t('common.back')}</Text>
        </TouchableOpacity>
        <View style={styles.successIconWrap}>
          <Text style={styles.successIcon}>✓</Text>
        </View>
        <Text style={styles.successTitle}>{t('groups.created')}</Text>
        <Text style={styles.successSub}>{t('groups.shareInviteLink')}</Text>
        <View style={styles.inviteRow}>
          <Text style={styles.inviteCode} numberOfLines={1}>{inviteMessage}</Text>
        </View>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare} activeOpacity={0.8}>
          <Text style={styles.shareButtonText}>{t('common.share')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.goButton} onPress={handleGoToGroup} activeOpacity={0.8}>
          <Text style={styles.goButtonText}>{t('groups.goToGroup')}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t('groups.createGroup')}</Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <View style={styles.field}>
          <Text style={styles.label}>{t('groups.nameLabel')}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t('groups.groupNamePlaceholder')}
            placeholderTextColor={tokens.colors.textMuted}
            autoCapitalize="words"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>{t('groups.descriptionLabel')}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder={t('groups.descriptionPlaceholder')}
            placeholderTextColor={tokens.colors.textMuted}
            multiline
            numberOfLines={3}
          />
        </View>
        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setIsPrivate((p) => !p)}
          activeOpacity={0.8}
        >
          <View style={[styles.checkbox, isPrivate && styles.checkboxChecked]}>
            {isPrivate ? <Text style={styles.checkMark}>✓</Text> : null}
          </View>
          <Text style={styles.checkLabel}>{t('groups.privateGroupLabel')}</Text>
        </TouchableOpacity>
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color={tokens.colors.surface} size="small" />
            ) : (
              <Text style={styles.submitText}>{t('common.save')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.surfaceTint },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24 },
  title: { fontSize: 20, fontWeight: '700', color: tokens.colors.textDark, marginBottom: 20 },
  errorText: { color: '#b91c1c', marginBottom: 12, fontSize: 14 },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', color: tokens.colors.textMain, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    borderRadius: tokens.borderRadius.xl,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: tokens.colors.surface,
    color: tokens.colors.textMain,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: tokens.colors.inputBorder,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: tokens.colors.primary, borderColor: tokens.colors.primary },
  checkMark: { color: '#fff', fontWeight: '700', fontSize: 14 },
  checkLabel: { fontSize: 14, color: tokens.colors.textMain },
  actions: { flexDirection: 'row', gap: 12 },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: tokens.borderRadius.xl,
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    alignItems: 'center',
  },
  cancelText: { color: tokens.colors.textMain, fontWeight: '600' },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: tokens.borderRadius.xl,
    backgroundColor: tokens.colors.primary,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '600' },
  successContent: { paddingHorizontal: 24, alignItems: 'center' },
  backButton: { alignSelf: 'flex-start', marginBottom: 16 },
  backText: { fontSize: 16, color: tokens.colors.textMuted },
  successIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.colors.softBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successIcon: { fontSize: 28, color: tokens.colors.primary, fontWeight: '700' },
  successTitle: { fontSize: 20, fontWeight: '600', color: tokens.colors.textDark, marginBottom: 8 },
  successSub: { fontSize: 14, color: tokens.colors.textMuted, marginBottom: 16 },
  inviteRow: { width: '100%', marginBottom: 12 },
  inviteCode: { fontSize: 12, color: tokens.colors.textMuted },
  shareButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: tokens.borderRadius.xl,
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    alignItems: 'center',
    marginBottom: 12,
  },
  shareButtonText: { color: tokens.colors.textMain, fontWeight: '600' },
  goButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: tokens.borderRadius.xl,
    backgroundColor: tokens.colors.primary,
    alignItems: 'center',
  },
  goButtonText: { color: '#fff', fontWeight: '600' },
});
