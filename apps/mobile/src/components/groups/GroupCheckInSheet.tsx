import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useI18n, useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';
import { checkIn } from '@/lib/api/client';

interface GroupCheckInSheetProps {
  visible: boolean;
  groupCode: string;
  placeCode: string;
  placeName: string;
  onClose: () => void;
  onSuccess: () => void;
}

function makeStyles(isDark: boolean) {
  const surface = isDark ? tokens.colors.darkSurface : '#ffffff';
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  const bg = isDark ? tokens.colors.darkBg : tokens.colors.backgroundLight;

  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 24,
      paddingBottom: 36,
    },
    title: { fontSize: 18, fontWeight: '700', color: textMain, marginBottom: 4 },
    subtitle: { fontSize: 14, color: textMuted, marginBottom: 20 },
    label: { fontSize: 12, fontWeight: '600', color: textMuted, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: textMain,
      backgroundColor: bg,
      minHeight: 80,
      textAlignVertical: 'top',
      marginBottom: 16,
    },
    errorText: {
      color: '#ef4444',
      fontSize: 13,
      marginBottom: 12,
      backgroundColor: isDark ? '#3f1515' : '#fef2f2',
      padding: 10,
      borderRadius: 8,
    },
    btnRow: { flexDirection: 'row', gap: 12 },
    cancelBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: border,
      alignItems: 'center',
    },
    cancelBtnText: { fontSize: 14, fontWeight: '600', color: textMuted },
    submitBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { fontSize: 14, fontWeight: '600', color: '#ffffff' },
  });
}

export default function GroupCheckInSheet({
  visible,
  groupCode,
  placeCode,
  placeName,
  onClose,
  onSuccess,
}: GroupCheckInSheetProps) {
  const { t } = useI18n();
  const { isDark } = useTheme();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      await checkIn(placeCode, {
        note: note.trim() || undefined,
        group_code: groupCode,
      });
      setNote('');
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.unexpectedError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('groups.checkIn')}</Text>
          <Text style={styles.subtitle}>{placeName}</Text>

          <Text style={styles.label}>{t('groups.notePlaceholder')}</Text>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder={t('groups.notePlaceholder')}
            placeholderTextColor={
              isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted
            }
            multiline
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>{t('groups.checkIn')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
