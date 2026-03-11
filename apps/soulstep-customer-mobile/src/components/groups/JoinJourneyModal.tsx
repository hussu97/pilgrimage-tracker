/**
 * JoinJourneyModal — animated bottom sheet for joining a group via invite code.
 *
 * Features:
 * - Spring slide-up animation on mount
 * - Paste from clipboard button
 * - Debounced preview fetch (GET /api/v1/groups/by-invite/{code})
 * - Join API call with loading, success (animated checkmark), and error states
 * - Auto-close + navigate to GroupDetail after success
 * - Full dark mode support
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Animated,
  StyleSheet,
  Pressable,
  Clipboard,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGroupByInviteCode, joinGroupByCode } from '@/lib/api/client';
import { useI18n, useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';
import type { RootStackParamList } from '@/app/navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface JourneyPreview {
  group_code: string;
  name: string;
  member_count?: number;
  total_sites?: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

type ModalState = 'idle' | 'loading-preview' | 'preview' | 'joining' | 'success' | 'error';

function makeStyles(isDark: boolean) {
  const bg = isDark ? tokens.colors.darkBg : tokens.colors.surface;
  const surface = isDark ? tokens.colors.darkSurface : '#F5F0E9';
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  const textSecondary = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary;

  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? tokens.colors.darkBorder : '#D1C7BD',
      alignSelf: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: textMain,
      marginBottom: 20,
      textAlign: 'center',
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: border,
      borderRadius: 12,
      backgroundColor: surface,
      paddingHorizontal: 12,
      marginBottom: 12,
      height: 50,
    },
    inputRowFocused: {
      borderColor: tokens.colors.primary,
    },
    codeInput: {
      flex: 1,
      fontSize: 16,
      color: textMain,
      letterSpacing: 1,
      height: 50,
      padding: 0,
    },
    pasteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(176,86,61,0.15)' : 'rgba(176,86,61,0.08)',
    },
    pasteBtnText: {
      fontSize: 11,
      fontWeight: '600',
      color: tokens.colors.primary,
    },
    previewCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
      padding: 14,
      marginBottom: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    previewIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: tokens.colors.primaryAlpha,
      alignItems: 'center',
      justifyContent: 'center',
    },
    previewInfo: { flex: 1, minWidth: 0 },
    previewName: {
      fontSize: 15,
      fontWeight: '700',
      color: textMain,
      marginBottom: 2,
    },
    previewMeta: {
      fontSize: 12,
      color: textSecondary,
    },
    previewLoading: {
      alignItems: 'center',
      paddingVertical: 12,
      marginBottom: 16,
    },
    joinBtn: {
      backgroundColor: tokens.colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: 12,
    },
    joinBtnDisabled: {
      opacity: 0.5,
    },
    joinBtnText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '700',
    },
    errorText: {
      color: '#dc2626',
      fontSize: 13,
      textAlign: 'center',
      marginBottom: 12,
    },
    successWrap: {
      alignItems: 'center',
      paddingVertical: 20,
    },
    successCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: '#dcfce7',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    successTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#16a34a',
      marginBottom: 4,
    },
    successSub: {
      fontSize: 13,
      color: textMuted,
    },
    muted: {
      fontSize: 12,
      color: textMuted,
      textAlign: 'center',
      marginBottom: 4,
    },
  });
}

export default function JoinJourneyModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();
  const { isDark } = useTheme();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  const [code, setCode] = useState('');
  const [focused, setFocused] = useState(false);
  const [state, setState] = useState<ModalState>('idle');
  const [preview, setPreview] = useState<JourneyPreview | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Spring animation for the sheet sliding up
  const translateY = useRef(new Animated.Value(400)).current;
  // Scale animation for the success checkmark
  const checkScale = useRef(new Animated.Value(0)).current;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when modal becomes visible
  useEffect(() => {
    if (visible) {
      setCode('');
      setState('idle');
      setPreview(null);
      setErrorMsg('');
      checkScale.setValue(0);
      translateY.setValue(400);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    }
  }, [visible, translateY, checkScale]);

  // Debounced preview fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (code.trim().length < 6) {
      if (state !== 'idle' && state !== 'error') {
        setState('idle');
        setPreview(null);
      }
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setState('loading-preview');
      setPreview(null);
      setErrorMsg('');
      try {
        const data = await getGroupByInviteCode(code.trim());
        setPreview(data as JourneyPreview);
        setState('preview');
      } catch (e) {
        setState('error');
        setErrorMsg(e instanceof Error ? e.message : t('groups.invalidCode'));
      }
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // We intentionally only re-run when code changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await Clipboard.getString();
      if (text) setCode(text.trim());
    } catch {
      // clipboard not available
    }
  }, []);

  const handleJoin = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setState('joining');
    setErrorMsg('');
    try {
      const result = await joinGroupByCode(trimmed);
      setState('success');
      // Animate checkmark
      Animated.spring(checkScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 200,
        friction: 8,
      }).start();
      // Auto-close and navigate
      setTimeout(() => {
        onClose();
        if (result.group_code) {
          navigation.navigate('GroupDetail', { groupCode: result.group_code });
        }
      }, 1500);
    } catch (e) {
      setState('error');
      const msg = e instanceof Error ? e.message : t('groups.joinFailed');
      if (msg.toLowerCase().includes('already')) {
        setErrorMsg(t('groups.alreadyMember'));
      } else if (msg.toLowerCase().includes('full')) {
        setErrorMsg(t('groups.journeyFull'));
      } else {
        setErrorMsg(t('groups.invalidCode'));
      }
    }
  }, [code, onClose, navigation, t, checkScale]);

  const isJoinable = state === 'preview' && preview != null;
  const joining = state === 'joining';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 20 },
            { transform: [{ translateY }] },
          ]}
          // Prevent backdrop press from propagating through the sheet
          onStartShouldSetResponder={() => true}
        >
          <Pressable onPress={() => {}} accessible={false}>
            {/* Handle bar */}
            <View style={styles.handle} />

            {/* Title */}
            <Text style={styles.title}>{t('groups.joinGroup')}</Text>

            {/* Code input */}
            {state !== 'success' && (
              <>
                <View style={[styles.inputRow, focused && styles.inputRowFocused]}>
                  <MaterialIcons
                    name="vpn-key"
                    size={18}
                    color={
                      focused
                        ? tokens.colors.primary
                        : isDark
                          ? tokens.colors.darkTextSecondary
                          : tokens.colors.textMuted
                    }
                    style={{ marginRight: 8 }}
                  />
                  <TextInput
                    style={styles.codeInput}
                    value={code}
                    onChangeText={setCode}
                    placeholder={t('groups.enterInviteCode')}
                    placeholderTextColor={
                      isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted
                    }
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    editable={!joining}
                  />
                  {Platform.OS !== 'web' && (
                    <TouchableOpacity
                      style={styles.pasteBtn}
                      onPress={handlePaste}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="content-paste" size={12} color={tokens.colors.primary} />
                      <Text style={styles.pasteBtnText}>{t('common.paste')}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Preview loading */}
                {state === 'loading-preview' && (
                  <View style={styles.previewLoading}>
                    <ActivityIndicator size="small" color={tokens.colors.primary} />
                  </View>
                )}

                {/* Preview card */}
                {state === 'preview' && preview && (
                  <View style={styles.previewCard}>
                    <View style={styles.previewIconWrap}>
                      <MaterialIcons name="route" size={22} color={tokens.colors.primary} />
                    </View>
                    <View style={styles.previewInfo}>
                      <Text style={styles.previewName} numberOfLines={1}>
                        {preview.name}
                      </Text>
                      <Text style={styles.previewMeta}>
                        {preview.member_count != null
                          ? `${preview.member_count} ${t('groups.members')}`
                          : ''}
                        {preview.member_count != null && preview.total_sites != null ? '  ·  ' : ''}
                        {preview.total_sites != null
                          ? `${preview.total_sites} ${t('groups.places')}`
                          : ''}
                      </Text>
                    </View>
                    <MaterialIcons name="check-circle" size={20} color={tokens.colors.openNow} />
                  </View>
                )}

                {/* Error message */}
                {state === 'error' && errorMsg ? (
                  <Text style={styles.errorText}>{errorMsg}</Text>
                ) : null}

                {/* Join button */}
                <TouchableOpacity
                  style={[styles.joinBtn, (!isJoinable || joining) && styles.joinBtnDisabled]}
                  onPress={handleJoin}
                  disabled={!isJoinable || joining}
                  activeOpacity={0.8}
                >
                  {joining ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.joinBtnText}>{t('groups.joinJourney')}</Text>
                  )}
                </TouchableOpacity>

                <Text style={styles.muted}>{t('groups.pasteOrTypeCode')}</Text>
              </>
            )}

            {/* Success state */}
            {state === 'success' && (
              <View style={styles.successWrap}>
                <Animated.View
                  style={[styles.successCircle, { transform: [{ scale: checkScale }] }]}
                >
                  <MaterialIcons name="check" size={40} color="#16a34a" />
                </Animated.View>
                <Text style={styles.successTitle}>{t('groups.joinedSuccess')}</Text>
                <Text style={styles.successSub}>{t('groups.redirectingToJourney')}</Text>
              </View>
            )}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
