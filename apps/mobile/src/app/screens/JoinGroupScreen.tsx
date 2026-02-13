import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGroupByInviteCode, joinGroupByCode } from '../../lib/api/client';
import { useI18n } from '../providers';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList, 'JoinGroup'>;
type JoinGroupRoute = RouteProp<RootStackParamList, 'JoinGroup'>;

export default function JoinGroupScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<JoinGroupRoute>();
  const inviteCodeFromParams = route.params?.inviteCode ?? '';
  const { t } = useI18n();
  const [codeInput, setCodeInput] = useState(inviteCodeFromParams);
  const [preview, setPreview] = useState<{ group_code: string; name: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  const code = (codeInput || inviteCodeFromParams).trim();

  useEffect(() => {
    if (inviteCodeFromParams) setCodeInput(inviteCodeFromParams);
  }, [inviteCodeFromParams]);

  useEffect(() => {
    if (!code) {
      setPreview(null);
      setError('');
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    setError('');
    getGroupByInviteCode(code)
      .then((data) => {
        if (!cancelled) {
          setPreview(data);
          setError('');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreview(null);
          setError('');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => { cancelled = true; };
  }, [code]);

  const handleJoin = async () => {
    if (!code) {
      setError('Enter an invite code');
      return;
    }
    setJoining(true);
    setError('');
    try {
      const res = await joinGroupByCode(code);
      setJoining(false);
      navigation.replace('GroupDetail', { groupCode: res.group_code });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setJoining(false);
    }
  };

  const goToGroups = () => navigation.navigate('Main');

  const showNoCodeState = !inviteCodeFromParams && !codeInput.trim();

  if (showNoCodeState) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 24, paddingHorizontal: 24 }]}>
        <Text style={styles.noCodeTitle}>No invite code</Text>
        <Text style={styles.noCodeDesc}>
          Open an invite link or enter a code below to join a group.
        </Text>
        <TextInput
          style={styles.input}
          value={codeInput}
          onChangeText={setCodeInput}
          placeholder="Invite code"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity style={styles.linkButton} onPress={goToGroups} activeOpacity={0.8}>
          <Text style={styles.linkButtonText}>{t('nav.groups')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingHorizontal: 24 }]}>
      <Text style={styles.title}>Join group</Text>
      <TextInput
        style={styles.input}
        value={codeInput}
        onChangeText={setCodeInput}
        placeholder="Invite code"
        placeholderTextColor="#9ca3af"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!joining}
      />
      {loadingPreview && code ? (
        <ActivityIndicator size="small" color="#0d9488" style={styles.loader} />
      ) : preview && code ? (
        <View style={styles.previewBox}>
          <Text style={styles.previewLabel}>You're joining</Text>
          <Text style={styles.previewName}>{preview.name}</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={goToGroups}
          activeOpacity={0.8}
        >
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.joinButton, (!code || joining) && styles.joinDisabled]}
          onPress={handleJoin}
          disabled={!code || joining}
          activeOpacity={0.8}
        >
          {joining ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.joinText}>Join</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  card: { paddingHorizontal: 24 },
  title: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#111',
    marginBottom: 16,
  },
  loader: { marginBottom: 16 },
  previewBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  previewLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  previewName: { fontSize: 16, fontWeight: '600', color: '#111' },
  errorText: { color: '#c00', marginBottom: 12, fontSize: 14 },
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
  joinButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0d9488',
    alignItems: 'center',
  },
  joinDisabled: { opacity: 0.6 },
  joinText: { color: '#fff', fontWeight: '600' },
  noCodeTitle: { fontSize: 18, fontWeight: '600', color: '#111', marginBottom: 8 },
  noCodeDesc: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  linkButton: { alignSelf: 'flex-start' },
  linkButtonText: { color: '#0d9488', fontWeight: '600' },
});
