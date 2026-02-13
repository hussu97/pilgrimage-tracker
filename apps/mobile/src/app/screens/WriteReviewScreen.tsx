import { useState, useEffect } from 'react';
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
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPlace, createReview, updateReview } from '../../lib/api/client';
import { useI18n } from '../providers';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList, 'WriteReview'>;
type WriteReviewRoute = RouteProp<RootStackParamList, 'WriteReview'>;

const STARS = [1, 2, 3, 4, 5];

export default function WriteReviewScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<WriteReviewRoute>();
  const { placeCode, reviewCode, rating: initRating, title: initTitle, body: initBody } = route.params;
  const { t } = useI18n();
  const [placeName, setPlaceName] = useState('');
  const [rating, setRating] = useState(initRating ?? 0);
  const [title, setTitle] = useState(initTitle ?? '');
  const [body, setBody] = useState(initBody ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isEdit = Boolean(reviewCode);

  useEffect(() => {
    if (!placeCode) return;
    getPlace(placeCode)
      .then((p) => setPlaceName(p.name))
      .catch(() => setPlaceName(''));
  }, [placeCode]);

  const handleSubmit = async () => {
    if (!placeCode) return;
    if (rating < 1 || rating > 5) {
      setError('Please select a rating (1–5 stars).');
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
      } else {
        await createReview(placeCode, {
          rating,
          title: title.trim() || undefined,
          body: body.trim() || undefined,
        });
      }
      navigation.replace('PlaceDetail', { placeCode });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!placeCode) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.muted}>Missing place.</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Main')}>
          <Text style={styles.link}>Home</Text>
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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backLink}
          activeOpacity={0.8}
        >
          <Text style={styles.backArrow}>←</Text>
          <Text style={styles.backLabel}>{t('common.back')}</Text>
        </TouchableOpacity>

        <Text style={styles.title}>
          {isEdit ? 'Edit your review' : t('places.writeReview')}
        </Text>
        {placeName ? <Text style={styles.placeName}>{placeName}</Text> : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.field}>
          <Text style={styles.label}>Rating *</Text>
          <View style={styles.starRow}>
            {STARS.map((value) => (
              <TouchableOpacity
                key={value}
                onPress={() => setRating(value)}
                style={styles.starBtn}
                activeOpacity={0.8}
                accessibilityLabel={`${value} stars`}
              >
                <Text style={styles.starIcon}>{value <= rating ? '★' : '☆'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Title (optional)</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Summarize your experience"
            placeholderTextColor="#9ca3af"
            autoCapitalize="sentences"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Review (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={body}
            onChangeText={setBody}
            placeholder="Tell others about your visit..."
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={4}
          />
        </View>

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
              <Text style={styles.submitText}>{isEdit ? t('common.save') : 'Submit'}</Text>
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { fontSize: 14, color: '#6b7280', marginBottom: 8 },
  link: { color: '#0d9488', fontWeight: '600' },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  backArrow: { fontSize: 20, color: '#6b7280' },
  backLabel: { fontSize: 16, color: '#6b7280' },
  title: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 4 },
  placeName: { fontSize: 14, color: '#6b7280', marginBottom: 20 },
  errorText: { color: '#c00', marginBottom: 12, fontSize: 14 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8 },
  starRow: { flexDirection: 'row', gap: 8 },
  starBtn: { padding: 4 },
  starIcon: { fontSize: 32, color: '#f59e0b' },
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
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
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
});
