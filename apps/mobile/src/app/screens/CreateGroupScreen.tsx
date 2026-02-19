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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createGroup, getPlaces } from '@/lib/api/client';
import { shareUrl } from '@/lib/share';
import { INVITE_LINK_BASE_URL } from '@/lib/constants';
import { useI18n, useTheme } from '@/app/providers';
import type { RootStackParamList } from '@/app/navigation';
import { tokens } from '@/lib/theme';
import PlaceSelector from '@/components/groups/PlaceSelector';
import type { Place } from '@/lib/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'CreateGroup'>;
type Step = 'details' | 'places' | 'review';

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
    stepDotDone: { backgroundColor: tokens.colors.primary },
    stepDotText: { fontSize: 11, fontWeight: '700', color: textMuted },
    stepDotTextActive: { color: '#ffffff' },
    stepLine: {
      flex: 1,
      height: 2,
      backgroundColor: isDark ? tokens.colors.darkBorder : '#e2e8f0',
    },
    stepLineActive: { backgroundColor: tokens.colors.primary },
    sectionTitle: { fontSize: 14, fontWeight: '600', color: textSecondary, marginBottom: 6 },
    field: { marginBottom: 16 },
    input: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      backgroundColor: surface,
      color: textMain,
    },
    textArea: { minHeight: 80, textAlignVertical: 'top' },
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
    checkMark: { color: '#fff', fontWeight: '700', fontSize: 14 },
    checkLabel: { fontSize: 14, color: textMain },
    actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: border,
      alignItems: 'center',
    },
    cancelText: { color: textMain, fontWeight: '600' },
    submitButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
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
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: border,
      alignItems: 'center',
      marginBottom: 12,
    },
    shareButtonText: { color: textMain, fontWeight: '600' },
    goButton: {
      width: '100%',
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
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
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
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

  const goNext = () => {
    if (step === 'details') setStep('places');
    else if (step === 'places') setStep('review');
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
      const g = await createGroup({
        name: name.trim(),
        description: description.trim() || undefined,
        is_private: isPrivate,
        path_place_codes: selectedPlaceCodes.length > 0 ? selectedPlaceCodes : undefined,
        cover_image_url: coverImageUrl.trim() || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
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
            <View style={styles.field}>
              <Text style={styles.sectionTitle}>{t('groups.nameLabel')} *</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder={t('groups.groupNamePlaceholder')}
                placeholderTextColor={textMuted}
                autoCapitalize="words"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.sectionTitle}>{t('groups.descriptionLabel')}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder={t('groups.descriptionPlaceholder')}
                placeholderTextColor={textMuted}
                multiline
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.sectionTitle}>{t('groups.coverImage')}</Text>
              <TextInput
                style={styles.input}
                value={coverImageUrl}
                onChangeText={setCoverImageUrl}
                placeholder={t('groups.coverImagePlaceholder')}
                placeholderTextColor={textMuted}
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.sectionTitle}>{t('groups.startDate')}</Text>
              <TextInput
                style={styles.input}
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={textMuted}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.sectionTitle}>{t('groups.endDate')}</Text>
              <TextInput
                style={styles.input}
                value={endDate}
                onChangeText={setEndDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={textMuted}
                keyboardType="numeric"
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
              <Text style={styles.checkLabel}>{t('groups.privateGroup')}</Text>
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
                style={[styles.submitButton, !name.trim() && styles.submitDisabled]}
                onPress={goNext}
                disabled={!name.trim()}
                activeOpacity={0.8}
              >
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
            <Text style={[styles.sectionTitle, { fontSize: 16, marginBottom: 16 }]}>
              {t('groups.reviewYourGroup')}
            </Text>
            <View style={styles.reviewCard}>
              <Text style={styles.reviewTitle}>{name}</Text>
              {description ? <Text style={styles.reviewDesc}>{description}</Text> : null}
              {startDate || endDate ? (
                <Text style={styles.reviewMeta}>
                  📅 {startDate} {startDate && endDate ? '–' : ''} {endDate}
                </Text>
              ) : null}
              {isPrivate ? (
                <Text style={styles.reviewMeta}>🔒 {t('groups.privateGroup')}</Text>
              ) : null}
            </View>
            {selectedPlaceObjects.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>
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
