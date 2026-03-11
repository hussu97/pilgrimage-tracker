import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGroupByInviteCode, joinGroupByCode } from '@/lib/api/client';
import { useFeedback, useI18n, useTheme } from '@/app/providers';
import { useAds } from '@/components/ads/AdProvider';
import { useUmamiTracking } from '@/lib/hooks/useUmamiTracking';
import type { RootStackParamList } from '@/app/navigation';
import { tokens } from '@/lib/theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'JoinGroup'>;
type JoinGroupRoute = RouteProp<RootStackParamList, 'JoinGroup'>;

function makeStyles(isDark: boolean) {
  const bg = isDark ? tokens.colors.darkBg : tokens.colors.surfaceTint;
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const textDark = isDark ? '#ffffff' : tokens.colors.textDark;
  const textMain = isDark ? '#ffffff' : tokens.colors.textMain;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  const inputText = isDark ? '#ffffff' : tokens.colors.textMain;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: bg },
    card: { paddingHorizontal: 24 },
    backButton: { marginBottom: 16 },
    backText: { fontSize: 16, color: textMuted },
    title: { fontSize: 20, fontWeight: '700', color: textDark, marginBottom: 16 },
    input: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: tokens.borderRadius.xl,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      backgroundColor: surface,
      color: inputText,
      marginBottom: 16,
    },
    loader: { marginBottom: 16 },
    previewBox: {
      padding: 16,
      borderRadius: tokens.borderRadius.xl,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
      marginBottom: 16,
      ...tokens.shadow.subtle,
    },
    previewLabel: { fontSize: 12, color: textMuted, marginBottom: 4 },
    previewName: { fontSize: 16, fontWeight: '600', color: textDark },
    errorText: { color: '#b91c1c', marginBottom: 12, fontSize: 14 },
    actions: { flexDirection: 'row', gap: 12 },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: tokens.borderRadius.xl,
      borderWidth: 1,
      borderColor: border,
      alignItems: 'center',
    },
    cancelText: { color: textMain, fontWeight: '600' },
    joinButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: tokens.borderRadius.xl,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
    },
    joinDisabled: { opacity: 0.6 },
    joinText: { color: '#fff', fontWeight: '600' },
    noCodeTitle: { fontSize: 18, fontWeight: '600', color: textDark, marginBottom: 8 },
    noCodeDesc: { fontSize: 14, color: textMuted, marginBottom: 16 },
    linkButton: { alignSelf: 'flex-start' },
    linkButtonText: { color: tokens.colors.primary, fontWeight: '600' },
  });
}

export default function JoinGroupScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<JoinGroupRoute>();
  const inviteCodeFromParams = route.params?.inviteCode ?? '';
  const { t } = useI18n();
  const { isDark } = useTheme();
  const { showSuccess, showError } = useFeedback();
  const { consent } = useAds();
  const { trackUmamiEvent } = useUmamiTracking('JoinGroup', consent.analytics);
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
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
    return () => {
      cancelled = true;
    };
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
      trackUmamiEvent('group_join');
      setJoining(false);
      showSuccess(t('feedback.groupJoined'));
      navigation.replace('GroupDetail', { groupCode: res.group_code });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      showError(t('feedback.error'));
      setJoining(false);
    }
  };

  const goToGroups = () => navigation.navigate('Main');

  const showNoCodeState = !inviteCodeFromParams && !codeInput.trim();

  if (showNoCodeState) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 24, paddingHorizontal: 24 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Text style={styles.backText}>‹ {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.noCodeTitle}>{t('groups.noInviteCode')}</Text>
        <Text style={styles.noCodeDesc}>{t('groups.inviteCodeHint')}</Text>
        <TextInput
          style={styles.input}
          value={codeInput}
          onChangeText={setCodeInput}
          placeholder={t('groups.inviteCodePlaceholder')}
          placeholderTextColor={isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted}
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
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        activeOpacity={0.8}
      >
        <Text style={styles.backText}>‹ {t('common.back')}</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{t('groups.joinGroup')}</Text>
      <TextInput
        style={styles.input}
        value={codeInput}
        onChangeText={setCodeInput}
        placeholder={t('groups.inviteCodePlaceholder')}
        placeholderTextColor={isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!joining}
      />
      {loadingPreview && code ? (
        <ActivityIndicator size="small" color={tokens.colors.primary} style={styles.loader} />
      ) : preview && code ? (
        <View style={styles.previewBox}>
          <Text style={styles.previewLabel}>{t('groups.youreJoining')}</Text>
          <Text style={styles.previewName}>{preview.name}</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancelButton} onPress={goToGroups} activeOpacity={0.8}>
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.joinButton, (!code || joining) && styles.joinDisabled]}
          onPress={handleJoin}
          disabled={!code || joining}
          activeOpacity={0.8}
        >
          {joining ? (
            <ActivityIndicator color={tokens.colors.surface} size="small" />
          ) : (
            <Text style={styles.joinText}>Join</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
