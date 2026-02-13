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
import { createGroup } from '../../lib/api/client';
import { shareUrl } from '../../lib/share';
import { INVITE_LINK_BASE_URL } from '../../lib/constants';
import { useI18n } from '../providers';
import type { RootStackParamList } from '../navigation';

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
        <Text style={styles.successTitle}>Group created</Text>
        <Text style={styles.successSub}>Share this link to invite others:</Text>
        <View style={styles.inviteRow}>
          <Text style={styles.inviteCode} numberOfLines={1}>{inviteMessage}</Text>
        </View>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare} activeOpacity={0.8}>
          <Text style={styles.shareButtonText}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.goButton} onPress={handleGoToGroup} activeOpacity={0.8}>
          <Text style={styles.goButtonText}>Go to group</Text>
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
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Group name"
            placeholderTextColor="#9ca3af"
            autoCapitalize="words"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="What's this group about?"
            placeholderTextColor="#9ca3af"
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
          <Text style={styles.checkLabel}>Private group (invite only)</Text>
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
              <ActivityIndicator color="#fff" size="small" />
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
  container: { flex: 1, backgroundColor: '#fafafa' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24 },
  title: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 20 },
  errorText: { color: '#c00', marginBottom: 12, fontSize: 14 },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#111',
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#d1d5db',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#0d9488', borderColor: '#0d9488' },
  checkMark: { color: '#fff', fontWeight: '700', fontSize: 14 },
  checkLabel: { fontSize: 14, color: '#374151' },
  actions: { flexDirection: 'row', gap: 12 },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  cancelText: { color: '#374151', fontWeight: '600' },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0d9488',
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '600' },
  successContent: { paddingHorizontal: 24, alignItems: 'center' },
  backButton: { alignSelf: 'flex-start', marginBottom: 16 },
  backText: { fontSize: 16, color: '#6b7280' },
  successIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(13, 148, 136, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successIcon: { fontSize: 28, color: '#0d9488', fontWeight: '700' },
  successTitle: { fontSize: 20, fontWeight: '600', color: '#111', marginBottom: 8 },
  successSub: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  inviteRow: { width: '100%', marginBottom: 12 },
  inviteCode: { fontSize: 12, color: '#6b7280' },
  shareButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    marginBottom: 12,
  },
  shareButtonText: { color: '#374151', fontWeight: '600' },
  goButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0d9488',
    alignItems: 'center',
  },
  goButtonText: { color: '#fff', fontWeight: '600' },
});
