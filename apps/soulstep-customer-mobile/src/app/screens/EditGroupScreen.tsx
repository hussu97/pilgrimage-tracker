import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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
  Image,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getGroup, updateGroup, getGroupMembers, uploadGroupCover } from '@/lib/api/client';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import { useAuth, useFeedback, useI18n, useTheme } from '@/app/providers';
import type { RootStackParamList } from '@/app/navigation';
import { tokens } from '@/lib/theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'EditGroup'>;
type RouteT = RouteProp<RootStackParamList, 'EditGroup'>;

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function makeStyles(isDark: boolean) {
  const bg = isDark ? tokens.colors.darkBg : tokens.colors.surfaceTint;
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  const textSecondary = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: bg },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 20 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: textMain, flex: 1 },
    label: { fontSize: 13, fontWeight: '600', color: textSecondary, marginBottom: 6 },
    field: { marginBottom: 16 },
    input: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 48,
      fontSize: 15,
      backgroundColor: surface,
      color: textMain,
    },
    inputError: { borderColor: '#ef4444' },
    errorMsg: { fontSize: 12, color: '#ef4444', marginTop: 4 },
    textArea: { minHeight: 80, textAlignVertical: 'top', paddingVertical: 12, height: undefined },
    optionalTag: { fontSize: 12, color: textMuted, marginLeft: 4 },
    // Cover image
    coverPlaceholder: {
      width: '100%',
      height: 170,
      borderRadius: 14,
      borderWidth: 2,
      borderStyle: 'dashed',
      borderColor: isDark ? tokens.colors.darkBorder : '#cbd5e1',
      backgroundColor: isDark ? tokens.colors.darkSurface : '#f8fafc',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginBottom: 16,
    },
    coverPreview: {
      width: '100%',
      height: 170,
      borderRadius: 14,
      overflow: 'hidden',
      marginBottom: 16,
    },
    coverImage: { width: '100%', height: '100%' },
    coverOverlay: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      flexDirection: 'row',
      gap: 6,
    },
    coverBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: 'rgba(255,255,255,0.9)',
    },
    coverBtnText: { fontSize: 11, fontWeight: '600', color: tokens.colors.textDark },
    coverBtnRemove: { fontSize: 11, fontWeight: '600', color: '#ef4444' },
    // Date picker field
    dateField: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 48,
      backgroundColor: surface,
    },
    dateText: { fontSize: 15, color: textMain, flex: 1 },
    datePlaceholder: { fontSize: 15, color: textMuted, flex: 1 },
    dateRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    dateCol: { flex: 1 },
    // DatePicker toolbar (iOS)
    pickerToolbar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: surface,
      borderTopWidth: 1,
      borderTopColor: border,
      borderRadius: 12,
    },
    pickerToolbarBtn: { paddingHorizontal: 8, paddingVertical: 4 },
    pickerToolbarCancel: { fontSize: 14, fontWeight: '500', color: textMuted },
    pickerToolbarDone: { fontSize: 14, fontWeight: '600', color: tokens.colors.primary },
    checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: border,
      marginRight: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: { backgroundColor: tokens.colors.primary, borderColor: tokens.colors.primary },
    checkLabel: { fontSize: 14, color: textMain },
    // Manage itinerary button
    itineraryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: tokens.colors.primary,
      backgroundColor: isDark ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.04)',
      marginBottom: 16,
    },
    itineraryBtnText: { fontSize: 14, fontWeight: '600', color: tokens.colors.primary },
    actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
    cancelButton: {
      flex: 1,
      height: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: { color: textMain, fontWeight: '600' },
    submitButton: {
      flex: 1,
      height: 48,
      borderRadius: 14,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitDisabled: { opacity: 0.7 },
    submitText: { color: '#fff', fontWeight: '600' },
    errorText: { color: '#b91c1c', marginBottom: 12, fontSize: 14 },
  });
}

export default function EditGroupScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const { groupCode } = route.params;
  const { t } = useI18n();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const { showSuccess, showError } = useFeedback();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState(false);
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [coverLocalUri, setCoverLocalUri] = useState('');
  const [coverUploading, setCoverUploading] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const tempStartDate = useRef<Date | null>(null);
  const tempEndDate = useRef<Date | null>(null);
  const [placeCount, setPlaceCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchGroup = useCallback(async () => {
    setLoading(true);
    try {
      const [g, members] = await Promise.all([getGroup(groupCode), getGroupMembers(groupCode)]);
      const isAdmin = members.some((m) => m.user_code === user?.user_code && m.role === 'admin');
      if (!isAdmin) {
        navigation.goBack();
        return;
      }
      setName(g.name);
      setDescription(g.description ?? '');
      setIsPrivate(g.is_private);
      setCoverImageUrl(g.cover_image_url ?? '');
      if (g.start_date) setStartDate(new Date(g.start_date));
      if (g.end_date) setEndDate(new Date(g.end_date));
      setPlaceCount(g.path_place_codes?.length ?? 0);
    } catch {
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [groupCode, user?.user_code, navigation]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);

  // Cover image picker
  const pickCoverImage = () => {
    Alert.alert(t('groups.coverImage'), '', [
      {
        text: t('groups.chooseFromLibrary'),
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
            allowsEditing: true,
            aspect: [16, 9],
          });
          if (!result.canceled && result.assets[0]) {
            setCoverLocalUri(result.assets[0].uri);
          }
        },
      },
      {
        text: t('groups.takePhoto'),
        onPress: async () => {
          const result = await ImagePicker.launchCameraAsync({
            quality: 0.8,
            allowsEditing: true,
            aspect: [16, 9],
          });
          if (!result.canceled && result.assets[0]) {
            setCoverLocalUri(result.assets[0].uri);
          }
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const removeCover = () => {
    setCoverLocalUri('');
    setCoverImageUrl('');
  };

  const coverDisplay = coverLocalUri || getFullImageUrl(coverImageUrl);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      let finalCoverUrl = coverImageUrl;
      // Upload new cover if local uri is set
      if (coverLocalUri) {
        setCoverUploading(true);
        const res = await uploadGroupCover(coverLocalUri);
        finalCoverUrl = res.url;
        setCoverUploading(false);
      }

      await updateGroup(groupCode, {
        name: name.trim(),
        description: description.trim() || undefined,
        is_private: isPrivate,
        cover_image_url: finalCoverUrl || undefined,
        start_date: startDate ? formatDate(startDate) : undefined,
        end_date: endDate ? formatDate(endDate) : undefined,
      });
      showSuccess(t('feedback.groupUpdated'));
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      showError(t('feedback.error'));
    } finally {
      setSubmitting(false);
      setCoverUploading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={tokens.colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name="arrow-back"
              size={20}
              color={isDark ? '#fff' : tokens.colors.textDark}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('groups.editGroup')}</Text>
        </View>

        {/* Cover Image */}
        {coverDisplay ? (
          <View style={styles.coverPreview}>
            <Image source={{ uri: coverDisplay }} style={styles.coverImage} resizeMode="cover" />
            <View style={styles.coverOverlay}>
              <TouchableOpacity
                style={styles.coverBtn}
                onPress={pickCoverImage}
                activeOpacity={0.8}
              >
                <MaterialIcons name="edit" size={14} color={tokens.colors.textDark} />
                <Text style={styles.coverBtnText}>{t('groups.changeCoverPhoto')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.coverBtn} onPress={removeCover} activeOpacity={0.8}>
                <Text style={styles.coverBtnRemove}>{t('groups.removeCoverPhoto')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.coverPlaceholder}
            onPress={pickCoverImage}
            activeOpacity={0.8}
          >
            <MaterialIcons name="photo-camera" size={28} color={textMuted} />
            <Text style={{ fontSize: 13, fontWeight: '500', color: textMuted }}>
              {t('groups.addCoverPhoto')}
            </Text>
          </TouchableOpacity>
        )}

        {/* Name */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('groups.nameLabel')} *</Text>
          <TextInput
            style={[styles.input, nameError && styles.inputError]}
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (nameError) setNameError(false);
            }}
            placeholderTextColor={textMuted}
            autoCapitalize="words"
          />
          {nameError && <Text style={styles.errorMsg}>{t('groups.nameRequired')}</Text>}
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={styles.label}>
            {t('groups.descriptionLabel')}
            <Text style={styles.optionalTag}> {t('groups.optional')}</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholderTextColor={textMuted}
            multiline
          />
        </View>

        {/* Dates */}
        <View style={styles.dateRow}>
          <View style={styles.dateCol}>
            <Text style={styles.label}>
              {t('groups.startDate')}
              <Text style={styles.optionalTag}> {t('groups.optional')}</Text>
            </Text>
            <TouchableOpacity
              style={styles.dateField}
              onPress={() => {
                setShowEndPicker(false);
                tempStartDate.current = startDate;
                setShowStartPicker(true);
              }}
              activeOpacity={0.8}
            >
              {startDate ? (
                <Text style={styles.dateText}>{formatDate(startDate)}</Text>
              ) : (
                <Text style={styles.datePlaceholder}>YYYY-MM-DD</Text>
              )}
              <MaterialIcons name="calendar-today" size={18} color={textMuted} />
            </TouchableOpacity>
          </View>
          <View style={styles.dateCol}>
            <Text style={styles.label}>
              {t('groups.endDate')}
              <Text style={styles.optionalTag}> {t('groups.optional')}</Text>
            </Text>
            <TouchableOpacity
              style={styles.dateField}
              onPress={() => {
                setShowStartPicker(false);
                tempEndDate.current = endDate;
                setShowEndPicker(true);
              }}
              activeOpacity={0.8}
            >
              {endDate ? (
                <Text style={styles.dateText}>{formatDate(endDate)}</Text>
              ) : (
                <Text style={styles.datePlaceholder}>YYYY-MM-DD</Text>
              )}
              <MaterialIcons name="calendar-today" size={18} color={textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {showStartPicker &&
          (Platform.OS === 'ios' ? (
            <View>
              <View style={styles.pickerToolbar}>
                <TouchableOpacity
                  style={styles.pickerToolbarBtn}
                  onPress={() => {
                    setStartDate(tempStartDate.current);
                    setShowStartPicker(false);
                  }}
                >
                  <Text style={styles.pickerToolbarCancel}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pickerToolbarBtn}
                  onPress={() => setShowStartPicker(false)}
                >
                  <Text style={styles.pickerToolbarDone}>{t('common.done')}</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={startDate ?? new Date()}
                mode="date"
                display="spinner"
                themeVariant={isDark ? 'dark' : 'light'}
                onChange={(_, d) => {
                  if (d) setStartDate(d);
                }}
              />
            </View>
          ) : (
            <DateTimePicker
              value={startDate ?? new Date()}
              mode="date"
              display="default"
              themeVariant={isDark ? 'dark' : 'light'}
              onChange={(_, d) => {
                setShowStartPicker(false);
                if (d) setStartDate(d);
              }}
            />
          ))}

        {showEndPicker &&
          (Platform.OS === 'ios' ? (
            <View>
              <View style={styles.pickerToolbar}>
                <TouchableOpacity
                  style={styles.pickerToolbarBtn}
                  onPress={() => {
                    setEndDate(tempEndDate.current);
                    setShowEndPicker(false);
                  }}
                >
                  <Text style={styles.pickerToolbarCancel}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pickerToolbarBtn}
                  onPress={() => setShowEndPicker(false)}
                >
                  <Text style={styles.pickerToolbarDone}>{t('common.done')}</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={endDate ?? new Date()}
                mode="date"
                display="spinner"
                themeVariant={isDark ? 'dark' : 'light'}
                onChange={(_, d) => {
                  if (d) setEndDate(d);
                }}
              />
            </View>
          ) : (
            <DateTimePicker
              value={endDate ?? new Date()}
              mode="date"
              display="default"
              themeVariant={isDark ? 'dark' : 'light'}
              onChange={(_, d) => {
                setShowEndPicker(false);
                if (d) setEndDate(d);
              }}
            />
          ))}

        {/* Private toggle */}
        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setIsPrivate((p) => !p)}
          activeOpacity={0.8}
        >
          <View style={[styles.checkbox, isPrivate && styles.checkboxChecked]}>
            {isPrivate ? <MaterialIcons name="check" size={14} color="#fff" /> : null}
          </View>
          <Text style={styles.checkLabel}>
            {t('groups.privateGroup')}
            <Text style={styles.optionalTag}> {t('groups.optional')}</Text>
          </Text>
        </TouchableOpacity>

        {/* Manage Itinerary button */}
        <TouchableOpacity
          style={styles.itineraryBtn}
          onPress={() => navigation.navigate('EditGroupPlaces', { groupCode })}
          activeOpacity={0.8}
        >
          <MaterialIcons name="edit" size={18} color={tokens.colors.primary} />
          <Text style={styles.itineraryBtnText}>
            {t('groups.manageItinerary')}
            {placeCount > 0 ? ` (${placeCount})` : ''}
          </Text>
        </TouchableOpacity>

        {error ? <Text style={[styles.errorText, { marginTop: 4 }]}>{error}</Text> : null}

        <View style={[styles.actions, { marginTop: 8 }]}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitButton, (submitting || !name.trim()) && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={submitting || !name.trim()}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.submitText}>{t('groups.saveChanges')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
