import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useI18n, useTheme } from '@/app/providers';
import { getGroups, addPlaceToGroup } from '@/lib/api/client';
import { tokens } from '@/lib/theme';
import type { Group } from '@/lib/types';
import type { RootStackParamList } from '@/app/navigation';

interface AddToGroupSheetProps {
  placeCode: string;
  placeName: string;
  onClose: () => void;
}

function makeStyles(isDark: boolean) {
  const surface = isDark ? tokens.colors.darkSurface : '#ffffff';
  const bg = isDark ? tokens.colors.darkBg : '#F0F7FF';
  const border = isDark ? tokens.colors.darkBorder : 'rgba(0,0,0,0.06)';
  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 24,
      paddingTop: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 20,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder,
      alignSelf: 'center',
      marginBottom: 20,
    },
    title: { fontSize: 18, fontWeight: '700', color: textMain, marginBottom: 16 },
    loadingContainer: { alignItems: 'center', paddingVertical: 32 },
    emptyContainer: { alignItems: 'center', paddingVertical: 32 },
    emptyText: { fontSize: 14, color: textMuted, marginBottom: 16, textAlign: 'center' },
    createBtn: {
      backgroundColor: tokens.colors.primary,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 12,
    },
    createBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    groupList: { maxHeight: 260, marginBottom: 16 },
    groupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
      marginBottom: 8,
    },
    groupRowSelected: {
      borderColor: tokens.colors.primary,
      backgroundColor: isDark ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.05)',
    },
    groupRowDisabled: {
      backgroundColor: bg,
      opacity: 0.55,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: isDark ? tokens.colors.darkBorder : '#CBD5E1',
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxSelected: {
      backgroundColor: tokens.colors.primary,
      borderColor: tokens.colors.primary,
    },
    groupName: { fontSize: 15, fontWeight: '600', color: textMain },
    groupMeta: { fontSize: 12, color: textMuted, marginTop: 2 },
    groupAlreadyLabel: { color: tokens.colors.primary, fontWeight: '600' },
    addBtn: {
      backgroundColor: tokens.colors.primary,
      paddingVertical: 15,
      borderRadius: 14,
      alignItems: 'center',
      marginBottom: 4,
    },
    addBtnDisabled: { opacity: 0.5 },
    addBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  });
}

export default function AddToGroupSheet({
  placeCode,
  placeName: _placeName,
  onClose,
}: AddToGroupSheetProps) {
  const { t } = useI18n();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const slideAnim = useRef(new Animated.Value(0)).current;

  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();

    getGroups()
      .then(setGroups)
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, [slideAnim]);

  const close = () => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(onClose);
  };

  const toggle = (groupCode: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(groupCode)) next.delete(groupCode);
      else next.add(groupCode);
      return next;
    });
  };

  const handleAdd = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      await Promise.all([...selected].map((gc) => addPlaceToGroup(gc, placeCode)));
      close();
    } catch {
      // ignore — feedback not available here without useFeedback; toast could be added later
    } finally {
      setSubmitting(false);
    }
  };

  const SHEET_HEIGHT = 420;
  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SHEET_HEIGHT, 0],
  });
  const bgOpacity = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] });

  return (
    <Modal visible transparent animationType="none" onRequestClose={close}>
      <View style={styles.overlay}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: bgOpacity }]}
          pointerEvents="box-none"
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        </Animated.View>

        <View style={{ justifyContent: 'flex-end' }}>
          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + 16 },
              { transform: [{ translateY }] },
            ]}
          >
            <View style={styles.handle} />
            <Text style={styles.title}>{t('groups.selectGroups')}</Text>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={tokens.colors.primary} />
              </View>
            ) : groups.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>{t('groups.noGroupsYetShort')}</Text>
                <TouchableOpacity
                  style={styles.createBtn}
                  onPress={() => {
                    close();
                    navigation.navigate('CreateGroup');
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.createBtnText}>{t('groups.create')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <ScrollView style={styles.groupList} showsVerticalScrollIndicator={false}>
                  {groups.map((g) => {
                    const alreadyIn = g.path_place_codes?.includes(placeCode);
                    const isChecked = selected.has(g.group_code);
                    return (
                      <TouchableOpacity
                        key={g.group_code}
                        disabled={!!alreadyIn}
                        onPress={() => !alreadyIn && toggle(g.group_code)}
                        activeOpacity={0.7}
                        style={[
                          styles.groupRow,
                          isChecked && styles.groupRowSelected,
                          alreadyIn && styles.groupRowDisabled,
                        ]}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            (isChecked || alreadyIn) && styles.checkboxSelected,
                          ]}
                        >
                          {(isChecked || alreadyIn) && (
                            <MaterialIcons name="check" size={13} color="#fff" />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.groupName} numberOfLines={1}>
                            {g.name}
                          </Text>
                          <Text style={styles.groupMeta}>
                            {g.member_count ?? 0} members
                            {alreadyIn && (
                              <Text style={styles.groupAlreadyLabel}>
                                {' · '}
                                {t('groups.placeAlreadyAdded')}
                              </Text>
                            )}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <TouchableOpacity
                  style={[
                    styles.addBtn,
                    (selected.size === 0 || submitting) && styles.addBtnDisabled,
                  ]}
                  disabled={selected.size === 0 || submitting}
                  onPress={handleAdd}
                  activeOpacity={0.85}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.addBtnText}>{t('groups.addPlace')}</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}
