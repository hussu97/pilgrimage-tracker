import { useState, useEffect, useMemo } from 'react';
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
  Modal,
} from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPlace, createReview, updateReview, uploadReviewPhoto } from '@/lib/api/client';
import { pickImages, compressImage, validateImage } from '@/lib/utils/imageUpload';
import { useFeedback, useI18n, useTheme } from '@/app/providers';
import { useAds } from '@/components/ads/AdProvider';
import { useUmamiTracking } from '@/lib/hooks/useUmamiTracking';
import type { RootStackParamList } from '@/app/navigation';
import type { PlaceDetail } from '@/lib/types';
import { tokens } from '@/lib/theme';
import { getFullImageUrl } from '@/lib/utils/imageUtils';

interface UploadedImage {
  id: number;
  url: string;
  width: number;
  height: number;
  thumbnailUri: string;
}

type Nav = NativeStackNavigationProp<RootStackParamList, 'WriteReview'>;
type WriteReviewRoute = RouteProp<RootStackParamList, 'WriteReview'>;

const STARS = [1, 2, 3, 4, 5];

function makeStyles(isDark: boolean) {
  const bg = isDark ? tokens.colors.darkBg : tokens.colors.surface;
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const textMain = isDark ? tokens.colors.textLight : tokens.colors.textMain;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  const textSecondary = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary;
  const textDark = isDark ? tokens.colors.textLight : tokens.colors.textDark;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: bg },
    scroll: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    muted: { fontSize: 14, color: textMuted, marginBottom: 8 },
    link: { color: tokens.colors.primary, fontWeight: '600' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: border,
    },
    headerBtn: { minWidth: 60 },
    headerCancel: { fontSize: 14, color: textMuted, fontWeight: '300' },
    headerTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: textMain,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    headerSave: { fontSize: 14, fontWeight: '600', color: tokens.colors.primary },
    headerSaveDisabled: { opacity: 0.5 },
    placeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginTop: 24,
      marginBottom: 24,
    },
    placeInfo: { flex: 1, marginRight: 16, minWidth: 0 },
    placeName: { fontSize: 22, fontWeight: '300', color: textDark, marginBottom: 4 },
    placeAddress: {
      fontSize: 12,
      color: textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    placeThumb: { width: 48, height: 48, borderRadius: 8 },
    errorText: { color: tokens.colors.errorDark, fontSize: 14, marginBottom: 12 },
    starRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24 },
    starBtn: { padding: 4 },
    starIcon: { fontSize: 28, color: tokens.colors.goldRank },
    starIconOff: { color: textMuted },
    textArea: {
      fontSize: 18,
      fontWeight: '300',
      color: textMain,
      minHeight: 140,
      padding: 0,
      marginBottom: 24,
    },
    photoScroll: { marginBottom: 24 },
    photoRow: { flexDirection: 'row', gap: 16, paddingRight: 24 },
    addPhotoBtn: {
      width: 64,
      height: 64,
      borderRadius: 8,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addPhotoIcon: { fontSize: 20, color: textMuted, marginBottom: 2 },
    addPhotoLabel: { fontSize: 10, color: textMuted },
    photoThumbWrap: {
      position: 'relative',
      width: 64,
      height: 64,
    },
    photoThumb: {
      width: 64,
      height: 64,
      borderRadius: 8,
    },
    photoRemoveBtn: {
      position: 'absolute',
      top: -8,
      right: -8,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: tokens.colors.error,
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoRemoveIcon: {
      color: tokens.colors.textLight,
      fontSize: 18,
      fontWeight: '600',
      lineHeight: 20,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
    },
    toggleLabel: { fontSize: 14, fontWeight: '300', color: textSecondary },
    toggle: {
      width: 40,
      height: 24,
      borderRadius: 12,
      backgroundColor: isDark ? tokens.colors.darkBorder : '#e2e8f0',
      justifyContent: 'center',
      paddingHorizontal: 2,
    },
    toggleOn: { backgroundColor: tokens.colors.primary },
    toggleKnob: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: tokens.colors.surface,
      alignSelf: 'flex-start',
    },
    toggleKnobOn: { alignSelf: 'flex-end' },
    submitWrap: { position: 'absolute', right: 24, zIndex: 40 },
    submitBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: tokens.colors.primary,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 9999,
      ...tokens.shadow.elevated,
    },
    submitText: { color: tokens.colors.textLight, fontWeight: '600', fontSize: 16 },
    submitArrow: { color: tokens.colors.textLight, fontSize: 20, fontWeight: '300' },
    submitDisabled: { opacity: 0.7 },
    editSubmitWrap: { paddingHorizontal: 24, paddingTop: 16 },
    editSubmitBtn: {
      backgroundColor: tokens.colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    overlay: {
      flex: 1,
      backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    successCard: {
      backgroundColor: surface,
      borderRadius: 16,
      padding: 32,
      width: '100%',
      maxWidth: 340,
      alignItems: 'center',
      ...tokens.shadow.elevated,
    },
    successIconWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: isDark ? '#1a2a4e' : '#eff6ff',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    successIcon: { fontSize: 24, color: tokens.colors.primary, fontWeight: '700' },
    successTitle: { fontSize: 18, fontWeight: '600', color: textMain, marginBottom: 8 },
    successDesc: { fontSize: 14, color: textMuted, fontWeight: '300', marginBottom: 24 },
    returnBtn: {},
    returnBtnText: { fontSize: 14, fontWeight: '600', color: tokens.colors.primary },
  });
}

export default function WriteReviewScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<WriteReviewRoute>();
  const {
    placeCode,
    reviewCode,
    rating: initRating,
    title: initTitle,
    body: initBody,
  } = route.params;
  const { t } = useI18n();
  const { isDark } = useTheme();
  const { showSuccess, showError } = useFeedback();
  const { consent } = useAds();
  const { trackUmamiEvent } = useUmamiTracking('WriteReview', consent.analytics);
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const [place, setPlace] = useState<PlaceDetail | null>(null);
  const [rating, setRating] = useState(initRating ?? 0);
  const [title, setTitle] = useState(initTitle ?? '');
  const [body, setBody] = useState(initBody ?? '');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [photos, setPhotos] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const isEdit = Boolean(reviewCode);

  useEffect(() => {
    if (!placeCode) return;
    getPlace(placeCode)
      .then(setPlace)
      .catch(() => setPlace(null));
  }, [placeCode]);

  const handlePickImages = async () => {
    const MAX_PHOTOS = 5;
    const remainingSlots = MAX_PHOTOS - photos.length;

    if (remainingSlots <= 0) {
      setUploadError(t('reviews.maxPhotos').replace('{count}', String(MAX_PHOTOS)));
      return;
    }

    setUploading(true);
    setUploadError('');

    try {
      const picked = await pickImages(remainingSlots);
      if (picked.length === 0) return;

      for (const image of picked) {
        const validation = validateImage(image);
        if (!validation.valid) {
          setUploadError(validation.error || t('reviews.invalidImage'));
          continue;
        }

        const compressed = await compressImage(image.uri);
        const result = await uploadReviewPhoto(compressed.uri);
        setPhotos((prev) => [...prev, { ...result, thumbnailUri: compressed.uri }]);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Permission')) {
        setUploadError(t('reviews.photoPermissionDenied'));
      } else {
        setUploadError(err instanceof Error ? err.message : t('reviews.uploadFailed'));
      }
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = (id: number) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSubmit = async () => {
    if (!placeCode) return;
    if (rating < 1 || rating > 5) {
      setError(t('reviews.selectRating'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (isEdit && reviewCode) {
        await updateReview(reviewCode, {
          rating,
          title: title.trim() || undefined,
          body: body.trim() || undefined,
        });
        showSuccess(t('feedback.reviewUpdated'));
      } else {
        await createReview(placeCode, {
          rating,
          title: title.trim() || undefined,
          body: body.trim() || undefined,
          is_anonymous: isAnonymous,
          photo_urls: photos.map((p) => p.url),
        });
        trackUmamiEvent('review_submit', { rating });
        showSuccess(t('feedback.reviewSubmitted'));
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      showError(t('feedback.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturn = () => {
    if (placeCode) navigation.replace('PlaceDetail', { placeCode });
  };

  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

  if (!placeCode) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.muted}>{t('places.missingCode')}</Text>
        <TouchableOpacity
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] })}
        >
          <Text style={styles.link}>{t('common.home')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Text style={styles.headerCancel}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('writeReview.title')}</Text>
        {isEdit ? (
          <TouchableOpacity onPress={handleSubmit} disabled={submitting} style={styles.headerBtn}>
            <Text style={[styles.headerSave, submitting && styles.headerSaveDisabled]}>
              {t('common.save')}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerBtn} />
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.placeRow}>
          <View style={styles.placeInfo}>
            <Text style={styles.placeName}>{place?.name ?? '…'}</Text>
            <Text style={styles.placeAddress} numberOfLines={1}>
              {place?.address ?? ''}
            </Text>
          </View>
          {place?.images?.[0]?.url ? (
            <Image
              source={{ uri: getFullImageUrl(place.images[0].url) }}
              style={styles.placeThumb}
            />
          ) : null}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.starRow}>
          {STARS.map((value) => (
            <TouchableOpacity
              key={value}
              onPress={() => setRating(value)}
              style={styles.starBtn}
              activeOpacity={0.8}
              accessibilityLabel={t('reviews.starsAccessibility').replace('{count}', String(value))}
            >
              <Text style={[styles.starIcon, value > rating && styles.starIconOff]}>
                {value <= rating ? '★' : '☆'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={styles.textArea}
          value={body}
          onChangeText={setBody}
          placeholder={t('writeReview.shareExperience')}
          placeholderTextColor={textMuted}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />

        {uploadError ? <Text style={styles.errorText}>{uploadError}</Text> : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.photoScroll}
          contentContainerStyle={styles.photoRow}
        >
          {photos.length < 5 && (
            <TouchableOpacity
              style={styles.addPhotoBtn}
              onPress={handlePickImages}
              disabled={uploading}
              activeOpacity={0.8}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={textMuted} />
              ) : (
                <>
                  <Text style={styles.addPhotoIcon}>+</Text>
                  <Text style={styles.addPhotoLabel}>{t('writeReview.addPhoto')}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {photos.map((photo) => (
            <View key={photo.id} style={styles.photoThumbWrap}>
              <Image source={{ uri: photo.thumbnailUri }} style={styles.photoThumb} />
              <TouchableOpacity
                style={styles.photoRemoveBtn}
                onPress={() => handleRemovePhoto(photo.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.photoRemoveIcon}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>{t('writeReview.postAnonymously')}</Text>
          <TouchableOpacity
            style={[styles.toggle, isAnonymous && styles.toggleOn]}
            onPress={() => setIsAnonymous((a) => !a)}
            activeOpacity={0.8}
          >
            <View style={[styles.toggleKnob, isAnonymous && styles.toggleKnobOn]} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {!isEdit && (
        <View style={[styles.submitWrap, { bottom: insets.bottom + 80 }]}>
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.9}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={styles.submitText}>{t('writeReview.submit')}</Text>
                <Text style={styles.submitArrow}>›</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {isEdit && (
        <View style={[styles.editSubmitWrap, { paddingBottom: insets.bottom + 24 }]}>
          <TouchableOpacity
            style={[styles.editSubmitBtn, submitting && styles.submitDisabled]}
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
      )}

      <Modal visible={success} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <Text style={styles.successIcon}>✓</Text>
            </View>
            <Text style={styles.successTitle}>{t('writeReview.reviewPosted')}</Text>
            <Text style={styles.successDesc}>{t('writeReview.yourVoiceHeard')}</Text>
            <TouchableOpacity style={styles.returnBtn} onPress={handleReturn} activeOpacity={0.8}>
              <Text style={styles.returnBtnText}>{t('writeReview.return')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
