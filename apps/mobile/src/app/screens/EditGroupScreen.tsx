import { useState, useMemo, useEffect, useCallback } from 'react';
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
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGroup, updateGroup, getGroupMembers, getPlaces } from '@/lib/api/client';
import { useAuth, useI18n, useTheme } from '@/app/providers';
import type { RootStackParamList } from '@/app/navigation';
import { tokens } from '@/lib/theme';
import PlaceSelector from '@/components/groups/PlaceSelector';
import type { Place } from '@/lib/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'EditGroup'>;
type RouteT = RouteProp<RootStackParamList, 'EditGroup'>;

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
    field: { marginBottom: 16 },
    sectionTitle: { fontSize: 14, fontWeight: '600', color: textSecondary, marginBottom: 6 },
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
    errorText: { color: '#b91c1c', marginBottom: 12, fontSize: 14 },
    itineraryLabel: { fontSize: 14, fontWeight: '600', color: textSecondary, marginBottom: 12 },
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
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedPlaceCodes, setSelectedPlaceCodes] = useState<string[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);

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
      setStartDate(g.start_date ?? '');
      setEndDate(g.end_date ?? '');
      setSelectedPlaceCodes(g.path_place_codes ?? []);
    } catch {
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [groupCode, user?.user_code, navigation]);

  useEffect(() => {
    fetchGroup();
    setPlacesLoading(true);
    getPlaces({ limit: 200 })
      .then((res) => setPlaces(res.places ?? []))
      .catch(() => {})
      .finally(() => setPlacesLoading(false));
  }, [fetchGroup]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await updateGroup(groupCode, {
        name: name.trim(),
        description: description.trim() || undefined,
        is_private: isPrivate,
        path_place_codes: selectedPlaceCodes,
        cover_image_url: coverImageUrl.trim() || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
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

        <View style={styles.field}>
          <Text style={styles.sectionTitle}>{t('groups.nameLabel')} *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
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

        <Text style={styles.itineraryLabel}>{t('groups.itinerary')}</Text>
        <PlaceSelector
          selectedCodes={selectedPlaceCodes}
          onChange={setSelectedPlaceCodes}
          places={places}
          loading={placesLoading}
        />

        {error ? <Text style={[styles.errorText, { marginTop: 12 }]}>{error}</Text> : null}

        <View style={[styles.actions, { marginTop: 16 }]}>
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
