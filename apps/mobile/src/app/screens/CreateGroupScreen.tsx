import { useState, useMemo, useEffect } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { createGroup, getPlaces, uploadGroupCover } from '@/lib/api/client';
import { shareUrl } from '@/lib/share';
import { INVITE_LINK_BASE_URL } from '@/lib/constants';
import { useI18n, useTheme } from '@/app/providers';
import type { RootStackParamList } from '@/app/navigation';
import { tokens } from '@/lib/theme';
import PlaceSelector from '@/components/groups/PlaceSelector';
import type { Place } from '@/lib/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'CreateGroup'>;
type Step = 'details' | 'places' | 'review';

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
    stepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 4 },
    stepDot: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: isDark ? tokens.colors.darkBorder : '#e2e8f0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepDotActive: { backgroundColor: tokens.colors.primary },
    stepDotText: { fontSize: 11, fontWeight: '700', color: textMuted },
    stepDotTextActive: { color: '#ffffff' },
    stepLine: {
      flex: 1,
      height: 2,
      backgroundColor: isDark ? tokens.colors.darkBorder : '#e2e8f0',
    },
    stepLineActive: { backgroundColor: tokens.colors.primary },
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
    optionalTag: { fontSize: 12, color: textMuted, marginLeft: 4 },
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
    reviewCard: {
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 14,
      padding: 16,
      marginBottom: 16,
    },
    reviewTitle: { fontSize: 18, fontWeight: '700', color: textMain, marginBottom: 4 },
    reviewDesc: { fontSize: 14, color: textMuted, marginBottom: 8 },
    reviewMeta: { fontSize: 12, color: textMuted, marginBottom: 4 },
    placeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      paddingHorizontal: 10,
      backgroundColor: isDark ? tokens.colors.darkBg : '#f8fafc',
      borderRadius: 8,
      marginBottom: 4,
    },
    placeIndex: { fontSize: 12, fontWeight: '700', color: tokens.colors.primary, width: 20 },
    placeName: { fontSize: 13, fontWeight: '500', color: textMain, flex: 1 },
    placeReligion: { fontSize: 11, color: textMuted },
    errorText: { color: '#b91c1c', marginBottom: 12, fontSize: 14 },
    successContent: { paddingHorizontal: 24, alignItems: 'center' },
    successIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: isDark ? '#1a2a4e' : tokens.colors.softBlue,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    successIcon: { fontSize: 28, color: tokens.colors.primary, fontWeight: '700' },
    successTitle: { fontSize: 20, fontWeight: '600', color: textMain, marginBottom: 8 },
    successSub: { fontSize: 14, color: textMuted, marginBottom: 16 },
    inviteRow: { width: '100%', marginBottom: 12 },
    inviteCode: { fontSize: 12, color: textMuted },
    shareButton: {
      width: '100%',
      height: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    shareButtonText: { color: textMain, fontWeight: '600' },
    goButton: {
      width: '100%',
      height: 48,
      borderRadius: 14,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    goButtonText: { color: '#fff', fontWeight: '600' },
  });
}

export default function CreateGroupScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();
  const { isDark } = useTheme();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  const [step, setStep] = useState<Step>('details');
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [selectedPlaceCodes, setSelectedPlaceCodes] = useState<string[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [groupCode, setGroupCode] = useState<string | null>(null);

  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

  useEffect(() => {
    if (step === 'places' && places.length === 0) {
      setPlacesLoading(true);
      getPlaces({ limit: 200 })
        .then((res) => setPlaces(res.places ?? []))
        .catch(() => {})
        .finally(() => setPlacesLoading(false));
    }
  }, [step, places.length]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant photo library access.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [16, 9],
    });
    if (!result.canceled && result.assets[0]) {
      setCoverUri(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant camera access.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
      aspect: [16, 9],
    });
    if (!result.canceled && result.assets[0]) {
      setCoverUri(result.assets[0].uri);
    }
  };

  const showCoverOptions = () => {
    Alert.alert(t('groups.coverImage'), '', [
      { text: t('groups.chooseFromLibrary'), onPress: pickImage },
      { text: t('groups.takePhoto'), onPress: takePhoto },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const goNext = () => {
    if (step === 'details') {
      if (!name.trim()) {
        setNameError(t('groups.nameRequired'));
        return;
      }
      setNameError('');
      setStep('places');
    } else if (step === 'places') {
      setStep('review');
    }
  };

  const goBack = () => {
    if (step === 'details') navigation.goBack();
    else if (step === 'places') setStep('details');
    else setStep('places');
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      let coverImageUrl: string | undefined;
      if (coverUri) {
        try {
          const result = await uploadGroupCover(coverUri);
          coverImageUrl = result.url;
        } catch (err) {
          setError(err instanceof Error ? err.message : t('common.error'));
          setSubmitting(false);
          return;
        }
      }

      const g = await createGroup({
        name: name.trim(),
        description: description.trim() || undefined,
        is_private: isPrivate,
        path_place_codes: selectedPlaceCodes.length > 0 ? selectedPlaceCodes : undefined,
        cover_image_url: coverImageUrl,
        start_date: startDate ? formatDate(startDate) : undefined,
        end_date: endDate ? formatDate(endDate) : undefined,
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

  // Success state
  if (inviteCode && groupCode) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.successContent,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <TouchableOpacity
          style={[styles.backBtn, { alignSelf: 'flex-start' }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <MaterialIcons
            name="arrow-back"
            size={20}
            color={isDark ? '#fff' : tokens.colors.textDark}
          />
        </TouchableOpacity>
        <View style={styles.successIconWrap}>
          <Text style={styles.successIcon}>✓</Text>
        </View>
        <Text style={styles.successTitle}>{t('groups.groupCreated')}</Text>
        <Text style={styles.successSub}>{t('groups.shareInviteLink')}</Text>
        <View style={styles.inviteRow}>
          <Text style={styles.inviteCode} numberOfLines={1}>
            {inviteMessage}
          </Text>
        </View>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare} activeOpacity={0.8}>
          <Text style={styles.shareButtonText}>{t('common.share')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.goButton}
          onPress={() => navigation.replace('GroupDetail', { groupCode })}
          activeOpacity={0.8}
        >
          <Text style={styles.goButtonText}>{t('groups.goToGroup')}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const steps: Step[] = ['details', 'places', 'review'];
  const stepIndex = steps.indexOf(step);

  const selectedPlaceObjects = selectedPlaceCodes
    .map((code) => places.find((p) => p.place_code === code))
    .filter(Boolean) as Place[];

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
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={goBack} activeOpacity={0.8}>
            <MaterialIcons
              name="arrow-back"
              size={20}
              color={isDark ? '#fff' : tokens.colors.textDark}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('groups.createGroup')}</Text>
        </View>

        {/* Step indicator */}
        <View style={styles.stepRow}>
          {steps.map((s, i) => (
            <View key={s} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={[styles.stepDot, i <= stepIndex ? styles.stepDotActive : {}]}>
                <Text style={[styles.stepDotText, i <= stepIndex ? styles.stepDotTextActive : {}]}>
                  {i < stepIndex ? '✓' : String(i + 1)}
                </Text>
              </View>
              {i < steps.length - 1 && (
                <View style={[styles.stepLine, i < stepIndex ? styles.stepLineActive : {}]} />
              )}
            </View>
          ))}
        </View>

        {/* Step 1: Details */}
        {step === 'details' && (
          <View>
            {/* Cover Image Picker */}
            {coverUri ? (
              <View style={styles.coverPreview}>
                <Image source={{ uri: coverUri }} style={styles.coverImage} resizeMode="cover" />
                <View style={styles.coverOverlay}>
                  <TouchableOpacity
                    style={styles.coverBtn}
                    onPress={showCoverOptions}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="edit" size={14} color={tokens.colors.textDark} />
                    <Text style={styles.coverBtnText}>{t('groups.changeCoverPhoto')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.coverBtn}
                    onPress={() => setCoverUri(null)}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="close" size={14} color="#ef4444" />
                    <Text style={styles.coverBtnRemove}>{t('groups.removeCoverPhoto')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.coverPlaceholder}
                onPress={showCoverOptions}
                activeOpacity={0.8}
              >
                <MaterialIcons name="photo-camera" size={32} color={textMuted} />
                <Text style={{ fontSize: 14, fontWeight: '500', color: textMuted }}>
                  {t('groups.addCoverPhoto')}
                </Text>
                <Text style={{ fontSize: 12, color: textMuted }}>{t('groups.optional')}</Text>
              </TouchableOpacity>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>{t('groups.nameLabel')} *</Text>
              <TextInput
                style={[styles.input, nameError ? styles.inputError : {}]}
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  if (nameError) setNameError('');
                }}
                placeholder={t('groups.groupNamePlaceholder')}
                placeholderTextColor={textMuted}
                autoCapitalize="words"
              />
              {nameError ? <Text style={styles.errorMsg}>{nameError}</Text> : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>
                {t('groups.descriptionLabel')}
                <Text style={styles.optionalTag}> {t('groups.optional')}</Text>
              </Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder={t('groups.descriptionPlaceholder')}
                placeholderTextColor={textMuted}
                multiline
              />
            </View>

            <View style={styles.dateRow}>
              <View style={styles.dateCol}>
                <Text style={styles.label}>
                  {t('groups.startDate')}
                  <Text style={styles.optionalTag}> {t('groups.optional')}</Text>
                </Text>
                <TouchableOpacity
                  style={styles.dateField}
                  onPress={() => setShowStartPicker(true)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="calendar-today" size={18} color={textMuted} />
                  {startDate ? (
                    <Text style={styles.dateText}>{formatDate(startDate)}</Text>
                  ) : (
                    <Text style={styles.datePlaceholder}>YYYY-MM-DD</Text>
                  )}
                </TouchableOpacity>
              </View>
              <View style={styles.dateCol}>
                <Text style={styles.label}>
                  {t('groups.endDate')}
                  <Text style={styles.optionalTag}> {t('groups.optional')}</Text>
                </Text>
                <TouchableOpacity
                  style={styles.dateField}
                  onPress={() => setShowEndPicker(true)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="calendar-today" size={18} color={textMuted} />
                  {endDate ? (
                    <Text style={styles.dateText}>{formatDate(endDate)}</Text>
                  ) : (
                    <Text style={styles.datePlaceholder}>YYYY-MM-DD</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {showStartPicker && (
              <DateTimePicker
                value={startDate ?? new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, date) => {
                  setShowStartPicker(Platform.OS === 'ios');
                  if (date) setStartDate(date);
                }}
              />
            )}
            {showEndPicker && (
              <DateTimePicker
                value={endDate ?? new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, date) => {
                  setShowEndPicker(Platform.OS === 'ios');
                  if (date) setEndDate(date);
                }}
              />
            )}

            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setIsPrivate((p) => !p)}
              activeOpacity={0.8}
            >
              <View style={[styles.checkbox, isPrivate && styles.checkboxChecked]}>
                {isPrivate ? <MaterialIcons name="check" size={16} color="#fff" /> : null}
              </View>
              <Text style={styles.checkLabel}>{t('groups.privateGroup')}</Text>
              <Text style={styles.optionalTag}>{t('groups.optional')}</Text>
            </TouchableOpacity>

            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => navigation.goBack()}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitButton} onPress={goNext} activeOpacity={0.8}>
                <Text style={styles.submitText}>{t('common.next')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 2: Places */}
        {step === 'places' && (
          <View>
            <PlaceSelector
              selectedCodes={selectedPlaceCodes}
              onChange={setSelectedPlaceCodes}
              places={places}
              loading={placesLoading}
            />
            <View style={[styles.actions, { marginTop: 16 }]}>
              <TouchableOpacity style={styles.cancelButton} onPress={goBack} activeOpacity={0.8}>
                <Text style={styles.cancelText}>{t('common.back')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitButton} onPress={goNext} activeOpacity={0.8}>
                <Text style={styles.submitText}>{t('common.next')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 3: Review */}
        {step === 'review' && (
          <View>
            <Text style={[styles.label, { fontSize: 16, marginBottom: 16 }]}>
              {t('groups.reviewYourGroup')}
            </Text>
            <View style={styles.reviewCard}>
              {coverUri && (
                <Image
                  source={{ uri: coverUri }}
                  style={{ width: '100%', height: 120, borderRadius: 10, marginBottom: 12 }}
                  resizeMode="cover"
                />
              )}
              <Text style={styles.reviewTitle}>{name}</Text>
              {description ? <Text style={styles.reviewDesc}>{description}</Text> : null}
              {(startDate || endDate) && (
                <Text style={styles.reviewMeta}>
                  📅 {startDate ? formatDate(startDate) : ''} {startDate && endDate ? '–' : ''}{' '}
                  {endDate ? formatDate(endDate) : ''}
                </Text>
              )}
              {isPrivate && <Text style={styles.reviewMeta}>🔒 {t('groups.privateGroup')}</Text>}
            </View>
            {selectedPlaceObjects.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={[styles.label, { marginBottom: 8 }]}>
                  {t('groups.placesInItinerary').replace(
                    '{count}',
                    String(selectedPlaceObjects.length),
                  )}
                </Text>
                {selectedPlaceObjects.map((place, i) => (
                  <View key={place.place_code} style={styles.placeRow}>
                    <Text style={styles.placeIndex}>{i + 1}</Text>
                    <Text style={styles.placeName} numberOfLines={1}>
                      {place.name}
                    </Text>
                    <Text style={styles.placeReligion}>{place.religion}</Text>
                  </View>
                ))}
              </View>
            )}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelButton} onPress={goBack} activeOpacity={0.8}>
                <Text style={styles.cancelText}>{t('common.back')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, submitting && styles.submitDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.8}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.submitText}>{t('groups.createAndInvite')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
