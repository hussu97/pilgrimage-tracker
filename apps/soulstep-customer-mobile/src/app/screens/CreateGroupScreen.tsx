/**
 * CreateGroupScreen — Journey Creation Flow (Phase 3)
 *
 * 4-step flow:
 *  1. intent  — pick a journey type (4 tappable cards)
 *  2. build   — search + select places, see selected strip
 *  3. polish  — name, description, cover image, dates, privacy
 *  4. success — animated check, invite share, navigate
 *
 * Mirrors apps/soulstep-customer-web/src/app/pages/CreateGroup.tsx
 */
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  Animated,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  createGroup,
  getPlaces,
  uploadGroupCover,
  getCities,
  getFeaturedGroups,
  getGroup,
} from '@/lib/api/client';
import type { FeaturedGroup } from '@/lib/api/client';
import { shareUrl } from '@/lib/share';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import { INVITE_LINK_BASE_URL } from '@/lib/constants';
import { useFeedback, useI18n, useTheme } from '@/app/providers';
import { useAds } from '@/components/ads/AdProvider';
import { useUmamiTracking } from '@/lib/hooks/useUmamiTracking';
import type { RootStackParamList } from '@/app/navigation';
import { tokens } from '@/lib/theme';
import type { Place } from '@/lib/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'CreateGroup'>;
type JourneyIntent = 'city' | 'faith' | 'route' | 'scratch';
type Step = 'intent' | 'build' | 'polish' | 'success';
type BuildSubStep = 'city_pick' | 'faith_pick' | 'route_pick' | null;

// ── Intent cards ──────────────────────────────────────────────────────────────

interface IntentCard {
  id: JourneyIntent;
  icon: string;
  titleKey: string;
  subtitleKey: string;
  color: string;
}

const INTENT_CARDS: IntentCard[] = [
  {
    id: 'city',
    icon: 'location-city',
    titleKey: 'journey.intent.city',
    subtitleKey: 'journey.intent.cityDesc',
    color: tokens.colors.primary,
  },
  {
    id: 'faith',
    icon: 'auto-awesome',
    titleKey: 'journey.intent.faith',
    subtitleKey: 'journey.intent.faithDesc',
    color: '#7c3aed',
  },
  {
    id: 'route',
    icon: 'route',
    titleKey: 'journey.intent.route',
    subtitleKey: 'journey.intent.routeDesc',
    color: '#0891b2',
  },
  {
    id: 'scratch',
    icon: 'edit',
    titleKey: 'journey.intent.scratch',
    subtitleKey: 'journey.intent.scratchDesc',
    color: '#059669',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function generateJourneyName(
  intent: JourneyIntent,
  places: Place[],
  selectedCity?: string | null,
  selectedFaith?: string | null,
  selectedRoute?: FeaturedGroup | null,
): string {
  if (intent === 'city' && selectedCity) return `${selectedCity} Sacred Journey`;
  if (intent === 'faith' && selectedFaith) {
    const r = selectedFaith.charAt(0).toUpperCase() + selectedFaith.slice(1);
    return `${r} Journey`;
  }
  if (intent === 'route' && selectedRoute) return selectedRoute.name;
  const location = places[0]?.address?.split(',')[0];
  const religion = places[0]?.religion;
  if (intent === 'city' && location) return `${location} Sacred Journey`;
  if (intent === 'faith' && religion) {
    const r = religion.charAt(0).toUpperCase() + religion.slice(1);
    return location ? `${location} ${r} Circuit` : `${r} Journey`;
  }
  if (intent === 'route') return 'Pilgrimage Route';
  return 'My Sacred Journey';
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(isDark: boolean) {
  const bg = isDark ? tokens.colors.darkBg : tokens.colors.backgroundLight;
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: bg },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 20 },

    // Header
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 20,
    },
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

    // Step indicator
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
      gap: 4,
    },
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
      width: 40,
      height: 2,
      backgroundColor: isDark ? tokens.colors.darkBorder : '#e2e8f0',
    },
    stepLineActive: { backgroundColor: tokens.colors.primary },

    // Intent cards
    intentCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 16,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: 'transparent',
      backgroundColor: surface,
      marginBottom: 12,
    },
    intentCardSelected: {
      borderColor: tokens.colors.primary,
    },
    intentIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    intentTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: textMain,
      marginBottom: 2,
    },
    intentSubtitle: {
      fontSize: 12,
      color: textMuted,
    },

    // Build step – selected strip
    selectedStrip: {
      minHeight: 40,
      marginBottom: 12,
    },
    selectedChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? 'rgba(196,112,84,0.2)' : 'rgba(196,112,84,0.1)',
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginRight: 8,
    },
    chipNum: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipNumText: { fontSize: 9, fontWeight: '700', color: '#fff' },
    chipName: { fontSize: 12, fontWeight: '500', color: tokens.colors.primary, maxWidth: 100 },
    chipRemove: { padding: 2 },

    // Build step – place row
    searchInput: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 44,
      marginBottom: 12,
    },
    searchText: { flex: 1, fontSize: 14, color: textMain },
    placeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      backgroundColor: surface,
      borderRadius: 12,
      marginBottom: 8,
    },
    placeThumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: border },
    placeInfo: { flex: 1 },
    placeName: { fontSize: 13, fontWeight: '600', color: textMain },
    placeAddr: { fontSize: 11, color: textMuted, marginTop: 1 },
    placeCheck: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    placeCheckActive: {
      backgroundColor: tokens.colors.primary,
      borderColor: tokens.colors.primary,
    },

    // Polish step – form
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted,
      marginBottom: 6,
    },
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
    coverPlaceholder: {
      width: '100%',
      height: 160,
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
      height: 160,
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
    dateRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    dateCol: { flex: 1 },
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
    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
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
    checkboxChecked: {
      backgroundColor: tokens.colors.primary,
      borderColor: tokens.colors.primary,
    },
    checkLabel: { fontSize: 14, color: textMain },
    optionalTag: { fontSize: 12, color: textMuted, marginLeft: 4 },

    // Review summary in polish step
    reviewCard: {
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 14,
      padding: 16,
      marginBottom: 16,
    },
    reviewTitle: { fontSize: 17, fontWeight: '700', color: textMain, marginBottom: 4 },
    reviewMeta: { fontSize: 12, color: textMuted, marginBottom: 4 },
    reviewPlaceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      paddingHorizontal: 10,
      backgroundColor: isDark ? tokens.colors.darkBg : '#f8fafc',
      borderRadius: 8,
      marginBottom: 4,
    },
    reviewPlaceIdx: { fontSize: 12, fontWeight: '700', color: tokens.colors.primary, width: 20 },
    reviewPlaceName: { fontSize: 13, fontWeight: '500', color: textMain, flex: 1 },
    reviewPlaceRel: { fontSize: 11, color: textMuted },

    // Footer
    footer: {
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 12,
      borderTopWidth: 1,
      borderTopColor: border,
      backgroundColor: surface,
    },
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

    // Success
    successWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    successIconOuter: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: isDark ? 'rgba(196,112,84,0.15)' : 'rgba(196,112,84,0.1)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    successTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: textMain,
      textAlign: 'center',
      marginBottom: 8,
    },
    successSub: {
      fontSize: 14,
      color: textMuted,
      textAlign: 'center',
      marginBottom: 24,
    },
    inviteCode: {
      fontSize: 12,
      color: textMuted,
      textAlign: 'center',
      marginBottom: 20,
      paddingHorizontal: 8,
    },
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

    errorText: { color: '#b91c1c', marginBottom: 12, fontSize: 14 },

    // Sub-step picker styles
    subStepTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: textMain,
      marginBottom: 6,
    },
    subStepSubtitle: {
      fontSize: 13,
      color: textMuted,
      marginBottom: 20,
    },
    cityCard: {
      flexDirection: 'column' as const,
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: surface,
      borderRadius: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: border,
      gap: 8,
    },
    cityCardRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
    },
    cityImageStrip: {
      flexDirection: 'row' as const,
      gap: 6,
    },
    cityImage: {
      width: 64,
      height: 48,
      borderRadius: 8,
      backgroundColor: border,
    },
    cityCardName: { fontSize: 15, fontWeight: '600', color: textMain },
    cityCardBadge: {
      fontSize: 11,
      fontWeight: '600',
      color: tokens.colors.primary,
      backgroundColor: isDark ? 'rgba(196,112,84,0.2)' : 'rgba(196,112,84,0.1)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    faithCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 18,
      borderRadius: 14,
      marginBottom: 12,
      borderWidth: 2,
    },
    faithCardLabel: { fontSize: 16, fontWeight: '700', color: textMain },
    faithCardDesc: { fontSize: 12, color: textMuted, marginTop: 2 },
    routeCard: {
      borderRadius: 14,
      overflow: 'hidden',
      marginBottom: 12,
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: border,
    },
    routeCardImage: { width: '100%', height: 100 },
    routeCardImagePlaceholder: {
      width: '100%',
      height: 100,
      backgroundColor: isDark ? tokens.colors.darkBorder : '#e2e8f0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    routeCardBody: { padding: 12 },
    routeCardName: { fontSize: 14, fontWeight: '700', color: textMain, marginBottom: 2 },
    routeCardDesc: { fontSize: 12, color: textMuted, marginBottom: 6 },
    routeCardMeta: { fontSize: 11, color: tokens.colors.primary, fontWeight: '600' },
  });
}

// ── Main component ────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const STEP_LABELS: Step[] = ['intent', 'build', 'polish'];

export default function CreateGroupScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();
  const { isDark } = useTheme();
  const { showError } = useFeedback();
  const { consent } = useAds();
  const { trackUmamiEvent } = useUmamiTracking('CreateGroup', consent.analytics);
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

  // Step state
  const [step, setStep] = useState<Step>('intent');
  const [intent, setIntent] = useState<JourneyIntent | null>(null);

  // Build step — sub-step state
  const [buildSubStep, setBuildSubStep] = useState<BuildSubStep>(null);
  const [selectedCity, setSelectedCity] = useState<{ city: string; city_slug: string } | null>(
    null,
  );
  const [selectedFaith, setSelectedFaith] = useState<string | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<FeaturedGroup | null>(null);
  const [cities, setCities] = useState<
    Array<{ city: string; city_slug: string; count: number; top_images?: string[] }>
  >([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [featuredRoutes, setFeaturedRoutes] = useState<FeaturedGroup[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);

  // Build step
  const [allPlaces, setAllPlaces] = useState<Place[]>([]);
  const [selectedPlaces, setSelectedPlaces] = useState<Place[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesLoadingMore, setPlacesLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Polish step
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const tempStartDate = useRef<Date | null>(null);
  const tempEndDate = useRef<Date | null>(null);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [groupCode, setGroupCode] = useState<string | null>(null);

  // Success animation
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  // ── Data fetching ───────────────────────────────────────────────────────────

  const fetchPlaces = useCallback(
    async (cursor?: string, search?: string, opts?: { city?: string; religions?: string[] }) => {
      const isInitial = !cursor;
      if (isInitial) setPlacesLoading(true);
      else setPlacesLoadingMore(true);
      try {
        const res = await getPlaces({
          limit: PAGE_SIZE,
          cursor: cursor ?? undefined,
          search: search || undefined,
          include_checkins: true,
          city: opts?.city,
          religions: (opts?.religions as any) ?? undefined,
        });
        if (isInitial) {
          setAllPlaces(res.places ?? []);
        } else {
          setAllPlaces((prev) => [...prev, ...(res.places ?? [])]);
        }
        setNextCursor(res.next_cursor ?? null);
      } catch {
        // silently fail
      } finally {
        if (isInitial) setPlacesLoading(false);
        else setPlacesLoadingMore(false);
      }
    },
    [],
  );

  // Fetch when entering build step with no sub-step pending
  useEffect(() => {
    if (step === 'build' && buildSubStep === null && allPlaces.length === 0) {
      fetchPlaces(undefined, searchQuery, activePlaceFilters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, buildSubStep]);

  // Auto-fill name when entering polish step
  useEffect(() => {
    if (step === 'polish' && !name && intent) {
      setName(
        generateJourneyName(
          intent,
          selectedPlaces,
          selectedCity?.city,
          selectedFaith,
          selectedRoute,
        ),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Success animation
  useEffect(() => {
    if (step === 'success') {
      Animated.parallel([
        Animated.spring(successScale, { toValue: 1, useNativeDriver: true }),
        Animated.timing(successOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [step, successScale, successOpacity]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const activePlaceFilters = useMemo(() => {
    if (intent === 'city' && selectedCity) return { city: selectedCity.city };
    if (intent === 'faith' && selectedFaith) return { religions: [selectedFaith] };
    return {};
  }, [intent, selectedCity, selectedFaith]);

  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchQuery(text);
      setAllPlaces([]);
      setNextCursor(null);
      fetchPlaces(undefined, text, activePlaceFilters);
    },
    [fetchPlaces, activePlaceFilters],
  );

  const handleLoadMore = useCallback(() => {
    if (nextCursor && !placesLoadingMore) {
      fetchPlaces(nextCursor, searchQuery, activePlaceFilters);
    }
  }, [nextCursor, placesLoadingMore, fetchPlaces, searchQuery, activePlaceFilters]);

  const togglePlace = useCallback((place: Place) => {
    setSelectedPlaces((prev) => {
      const exists = prev.some((p) => p.place_code === place.place_code);
      return exists ? prev.filter((p) => p.place_code !== place.place_code) : [...prev, place];
    });
  }, []);

  const isSelected = (place: Place) =>
    selectedPlaces.some((p) => p.place_code === place.place_code);

  // Cover image
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

  // Date pickers
  const openStartPicker = () => {
    setShowEndPicker(false);
    tempStartDate.current = startDate;
    setShowStartPicker(true);
  };
  const openEndPicker = () => {
    setShowStartPicker(false);
    tempEndDate.current = endDate;
    setShowEndPicker(true);
  };
  const confirmStartDate = () => setShowStartPicker(false);
  const cancelStartDate = () => {
    setStartDate(tempStartDate.current);
    setShowStartPicker(false);
  };
  const confirmEndDate = () => setShowEndPicker(false);
  const cancelEndDate = () => {
    setEndDate(tempEndDate.current);
    setShowEndPicker(false);
  };

  // Fetch cities for city picker
  const fetchCities = useCallback(async () => {
    setCitiesLoading(true);
    try {
      const data = await getCities({ limit: 50, include_images: true });
      setCities(data.cities ?? []);
    } catch {
      setCities([]);
    } finally {
      setCitiesLoading(false);
    }
  }, []);

  // Fetch featured routes for route picker
  const fetchFeaturedRoutes = useCallback(async () => {
    setRoutesLoading(true);
    try {
      const data = await getFeaturedGroups();
      setFeaturedRoutes(data ?? []);
    } catch {
      setFeaturedRoutes([]);
    } finally {
      setRoutesLoading(false);
    }
  }, []);

  // Navigation
  const goNext = () => {
    if (step === 'intent') {
      if (!intent) return;
      if (intent === 'city') {
        setStep('build');
        setBuildSubStep('city_pick');
        fetchCities();
      } else if (intent === 'faith') {
        setStep('build');
        setBuildSubStep('faith_pick');
      } else if (intent === 'route') {
        setStep('build');
        setBuildSubStep('route_pick');
        fetchFeaturedRoutes();
      } else {
        setStep('build');
        setBuildSubStep(null);
      }
    } else if (step === 'build') {
      setStep('polish');
    } else if (step === 'polish') {
      if (!name.trim()) {
        setNameError(t('groups.nameRequired'));
        return;
      }
      setNameError('');
      handleSubmit();
    }
  };

  const goBack = () => {
    if (step === 'intent') navigation.goBack();
    else if (step === 'build') {
      if (buildSubStep !== null) {
        // From city/faith/route picker, go back to intent
        setStep('intent');
        setBuildSubStep(null);
        setSelectedCity(null);
        setSelectedFaith(null);
        setAllPlaces([]);
        setSelectedPlaces([]);
      } else if (intent !== 'scratch' && (selectedCity || selectedFaith)) {
        // From filtered place list — restore the sub-step picker
        if (intent === 'city') {
          setBuildSubStep('city_pick');
          setAllPlaces([]);
        } else if (intent === 'faith') {
          setBuildSubStep('faith_pick');
          setAllPlaces([]);
        }
      } else {
        setStep('intent');
        setBuildSubStep(null);
      }
    } else if (step === 'polish') setStep('build');
    else navigation.goBack();
  };

  // Submit
  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      let coverImageUrl: string | undefined;
      if (coverUri) {
        try {
          const result = await uploadGroupCover(coverUri);
          coverImageUrl = result.url;
        } catch (err) {
          setSubmitError(err instanceof Error ? err.message : t('common.error'));
          showError(t('feedback.error'));
          setSubmitting(false);
          return;
        }
      }
      const g = await createGroup({
        name: name.trim(),
        description: description.trim() || undefined,
        is_private: isPrivate,
        path_place_codes:
          selectedPlaces.length > 0 ? selectedPlaces.map((p) => p.place_code) : undefined,
        cover_image_url: coverImageUrl,
        start_date: startDate ? formatDate(startDate) : undefined,
        end_date: endDate ? formatDate(endDate) : undefined,
      });
      trackUmamiEvent('journey_create', { place_count: selectedPlaces.length, intent: intent });
      setInviteCode(g.invite_code);
      setGroupCode(g.group_code);
      setStep('success');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('common.error'));
      showError(t('feedback.error'));
    } finally {
      setSubmitting(false);
    }
  };

  // Share
  const inviteMessage = inviteCode
    ? INVITE_LINK_BASE_URL
      ? `${INVITE_LINK_BASE_URL}/join?code=${inviteCode}`
      : `Join my SoulStep journey with code: ${inviteCode}`
    : '';

  const handleShare = async () => {
    if (inviteMessage) await shareUrl(t('journey.newJourney') || 'New Journey', inviteMessage);
  };

  // ── Step indicator ──────────────────────────────────────────────────────────

  const stepIndex = STEP_LABELS.indexOf(step as Step);

  const renderStepIndicator = () => (
    <View style={styles.stepRow}>
      {STEP_LABELS.map((s, i) => (
        <View key={s} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={[
              styles.stepDot,
              i <= stepIndex && step !== 'success' ? styles.stepDotActive : {},
            ]}
          >
            <Text
              style={[
                styles.stepDotText,
                i <= stepIndex && step !== 'success' ? styles.stepDotTextActive : {},
              ]}
            >
              {i < stepIndex ? '✓' : String(i + 1)}
            </Text>
          </View>
          {i < STEP_LABELS.length - 1 && (
            <View style={[styles.stepLine, i < stepIndex ? styles.stepLineActive : {}]} />
          )}
        </View>
      ))}
    </View>
  );

  // ── iOS date picker with toolbar ────────────────────────────────────────────

  const renderIOSDatePicker = (
    value: Date,
    onChange: (date: Date) => void,
    onCancel: () => void,
    onDone: () => void,
  ) => (
    <View>
      <View style={styles.pickerToolbar}>
        <TouchableOpacity style={styles.pickerToolbarBtn} onPress={onCancel}>
          <Text style={styles.pickerToolbarCancel}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.pickerToolbarBtn} onPress={onDone}>
          <Text style={styles.pickerToolbarDone}>{t('common.done')}</Text>
        </TouchableOpacity>
      </View>
      <DateTimePicker
        value={value}
        mode="date"
        display="spinner"
        themeVariant={isDark ? 'dark' : 'light'}
        onChange={(_, date) => {
          if (date) onChange(date);
        }}
      />
    </View>
  );

  // ── Success screen ──────────────────────────────────────────────────────────

  if (step === 'success') {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.successWrap}>
          <Animated.View
            style={[
              styles.successIconOuter,
              { transform: [{ scale: successScale }], opacity: successOpacity },
            ]}
          >
            <MaterialIcons name="check-circle" size={48} color={tokens.colors.primary} />
          </Animated.View>
          <Animated.Text style={[styles.successTitle, { opacity: successOpacity }]}>
            {t('journey.successTitle') || 'Journey Created!'}
          </Animated.Text>
          <Animated.Text style={[styles.successSub, { opacity: successOpacity }]}>
            {t('journey.successDesc') || 'Your sacred journey is ready to explore.'}
          </Animated.Text>
          {inviteMessage ? (
            <Text style={styles.inviteCode} numberOfLines={2}>
              {inviteMessage}
            </Text>
          ) : null}
          <TouchableOpacity style={styles.shareButton} onPress={handleShare} activeOpacity={0.8}>
            <Text style={styles.shareButtonText}>
              {t('journey.inviteFriends') || 'Invite Friends'}
            </Text>
          </TouchableOpacity>
          {groupCode && (
            <TouchableOpacity
              style={styles.goButton}
              onPress={() => navigation.replace('GroupDetail', { groupCode })}
              activeOpacity={0.8}
            >
              <Text style={styles.goButtonText}>
                {t('journey.startExploring') || 'Start Exploring'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // ── Intent step ─────────────────────────────────────────────────────────────

  if (step === 'intent') {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={undefined}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 16, paddingBottom: 24 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backBtn} onPress={goBack} activeOpacity={0.8}>
              <MaterialIcons
                name="arrow-back"
                size={20}
                color={isDark ? '#fff' : tokens.colors.textDark}
              />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('journey.newJourney') || 'New Journey'}</Text>
          </View>

          {renderStepIndicator()}

          <Text style={[styles.label, { fontSize: 15, marginBottom: 16 }]}>
            {t('dashboard.whatDrawsYou') || 'What kind of journey?'}
          </Text>

          {INTENT_CARDS.map((card) => (
            <TouchableOpacity
              key={card.id}
              style={[styles.intentCard, intent === card.id && styles.intentCardSelected]}
              onPress={() => {
                setSelectedCity(null);
                setSelectedFaith(null);
                setAllPlaces([]);
                setSelectedPlaces([]);
                setIntent(card.id);
              }}
              activeOpacity={0.85}
            >
              <View style={[styles.intentIconCircle, { backgroundColor: card.color + '20' }]}>
                <MaterialIcons name={card.icon as any} size={24} color={card.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.intentTitle}>{t(card.titleKey) || card.id}</Text>
                <Text style={styles.intentSubtitle}>{t(card.subtitleKey) || ''}</Text>
              </View>
              {intent === card.id && (
                <MaterialIcons name="check-circle" size={22} color={tokens.colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitButton, !intent && styles.submitDisabled]}
            onPress={goNext}
            disabled={!intent}
            activeOpacity={0.8}
          >
            <Text style={styles.submitText}>{t('common.next')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Build step – city picker ─────────────────────────────────────────────────

  if (step === 'build' && buildSubStep === 'city_pick') {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={undefined}>
        <View style={[styles.content, { flex: 1, paddingTop: insets.top + 16 }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backBtn} onPress={goBack} activeOpacity={0.8}>
              <MaterialIcons
                name="arrow-back"
                size={20}
                color={isDark ? '#fff' : tokens.colors.textDark}
              />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('journey.newJourney') || 'New Journey'}</Text>
          </View>
          {renderStepIndicator()}
          <Text style={styles.subStepTitle}>{t('journey.pickCity') || 'Choose your city'}</Text>
          {citiesLoading ? (
            <ActivityIndicator color={tokens.colors.primary} style={{ marginTop: 24 }} />
          ) : cities.length === 0 ? (
            <Text style={[styles.placeAddr, { textAlign: 'center', marginTop: 24 }]}>
              {t('home.noPlacesFound') || 'No cities found'}
            </Text>
          ) : (
            <FlatList
              data={cities}
              keyExtractor={(c) => c.city_slug}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: c }) => (
                <TouchableOpacity
                  style={styles.cityCard}
                  onPress={() => {
                    setSelectedCity({ city: c.city, city_slug: c.city_slug });
                    setBuildSubStep(null);
                    setAllPlaces([]);
                    fetchPlaces(undefined, undefined, { city: c.city });
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.cityCardRow}>
                    <Text style={styles.cityCardName}>{c.city}</Text>
                    <Text style={styles.cityCardBadge}>{c.count}</Text>
                  </View>
                  {(c.top_images?.length ?? 0) > 0 && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.cityImageStrip}
                      scrollEnabled={false}
                    >
                      {c.top_images!.slice(0, 3).map((imgUrl, idx) => (
                        <Image
                          key={idx}
                          source={{ uri: getFullImageUrl(imgUrl) }}
                          style={styles.cityImage}
                          resizeMode="cover"
                        />
                      ))}
                    </ScrollView>
                  )}
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Build step – faith picker ────────────────────────────────────────────────

  if (step === 'build' && buildSubStep === 'faith_pick') {
    const FAITH_OPTIONS = [
      {
        id: 'islam',
        label: 'Islam',
        icon: 'mosque',
        color: '#0891b2',
        desc: 'Mosques & Islamic sites',
      },
      {
        id: 'hinduism',
        label: 'Hinduism',
        icon: 'temple-hindu',
        color: '#d97706',
        desc: 'Temples & Hindu sites',
      },
      {
        id: 'christianity',
        label: 'Christianity',
        icon: 'church',
        color: '#7c3aed',
        desc: 'Churches & Christian sites',
      },
    ];
    return (
      <KeyboardAvoidingView style={styles.container} behavior={undefined}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 16, paddingBottom: 24 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backBtn} onPress={goBack} activeOpacity={0.8}>
              <MaterialIcons
                name="arrow-back"
                size={20}
                color={isDark ? '#fff' : tokens.colors.textDark}
              />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('journey.newJourney') || 'New Journey'}</Text>
          </View>
          {renderStepIndicator()}
          <Text style={styles.subStepTitle}>{t('journey.pickFaith') || 'Choose your faith'}</Text>
          {FAITH_OPTIONS.map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[
                styles.faithCard,
                { borderColor: f.color + '40', backgroundColor: f.color + '10' },
              ]}
              onPress={() => {
                setSelectedFaith(f.id);
                setBuildSubStep(null);
                setAllPlaces([]);
                fetchPlaces(undefined, undefined, { religions: [f.id] });
              }}
              activeOpacity={0.85}
            >
              <View style={[styles.intentIconCircle, { backgroundColor: f.color + '20' }]}>
                <MaterialIcons name={f.icon as any} size={28} color={f.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.faithCardLabel}>{f.label}</Text>
                <Text style={styles.faithCardDesc}>{f.desc}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={textMuted} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Build step – route picker ────────────────────────────────────────────────

  if (step === 'build' && buildSubStep === 'route_pick') {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={undefined}>
        <View style={[styles.content, { flex: 1, paddingTop: insets.top + 16 }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backBtn} onPress={goBack} activeOpacity={0.8}>
              <MaterialIcons
                name="arrow-back"
                size={20}
                color={isDark ? '#fff' : tokens.colors.textDark}
              />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('journey.newJourney') || 'New Journey'}</Text>
          </View>
          {renderStepIndicator()}
          <Text style={styles.subStepTitle}>
            {t('journey.pickRoute') || 'Choose a famous route'}
          </Text>
          {routesLoading ? (
            <ActivityIndicator color={tokens.colors.primary} style={{ marginTop: 24 }} />
          ) : featuredRoutes.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 32, gap: 12 }}>
              <MaterialIcons name="route" size={48} color={textMuted} />
              <Text style={[styles.placeAddr, { textAlign: 'center' }]}>
                {t('journey.routeNoResults') || 'No famous routes yet — search manually'}
              </Text>
              <TouchableOpacity
                style={[styles.submitButton, { paddingHorizontal: 24, flex: 0, height: 44 }]}
                onPress={() => {
                  setBuildSubStep(null);
                  fetchPlaces();
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.submitText}>{t('common.search') || 'Search'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={featuredRoutes}
              keyExtractor={(r) => r.group_code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: route }) => (
                <TouchableOpacity
                  style={styles.routeCard}
                  onPress={async () => {
                    try {
                      // Fetch full group detail to get place list
                      const detail = await getGroup(route.group_code);
                      if (detail.path_place_codes?.length) {
                        // Fetch the places by getting a filtered list
                        const res = await getPlaces({ limit: 100 });
                        const placesMap = new Map((res.places ?? []).map((p) => [p.place_code, p]));
                        const ordered = detail.path_place_codes
                          .map((code) => placesMap.get(code))
                          .filter(Boolean) as Place[];
                        setSelectedPlaces(ordered);
                        setAllPlaces(res.places ?? []);
                      }
                      setSelectedRoute(route);
                      setBuildSubStep(null);
                    } catch {
                      // Fall back: just dismiss picker
                      setSelectedRoute(route);
                      setBuildSubStep(null);
                      fetchPlaces();
                    }
                  }}
                  activeOpacity={0.85}
                >
                  {route.cover_image_url ? (
                    <Image
                      source={{ uri: route.cover_image_url }}
                      style={styles.routeCardImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.routeCardImagePlaceholder}>
                      <MaterialIcons name="route" size={36} color={textMuted} />
                    </View>
                  )}
                  <View style={styles.routeCardBody}>
                    <Text style={styles.routeCardName}>{route.name}</Text>
                    {route.description ? (
                      <Text style={styles.routeCardDesc} numberOfLines={2}>
                        {route.description}
                      </Text>
                    ) : null}
                    <Text style={styles.routeCardMeta}>
                      {route.total_sites} {route.total_sites === 1 ? 'site' : 'sites'}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Build step ──────────────────────────────────────────────────────────────

  if (step === 'build') {
    const renderPlaceItem = ({ item: place }: { item: Place }) => {
      const selected = isSelected(place);
      const thumb = place.images?.[0]?.url ? getFullImageUrl(place.images[0].url) : undefined;
      return (
        <TouchableOpacity
          style={styles.placeRow}
          onPress={() => togglePlace(place)}
          activeOpacity={0.85}
        >
          {thumb ? (
            <Image source={{ uri: thumb }} style={styles.placeThumb} resizeMode="cover" />
          ) : (
            <View style={[styles.placeThumb, { alignItems: 'center', justifyContent: 'center' }]}>
              <MaterialIcons name="place" size={22} color={textMuted} />
            </View>
          )}
          <View style={styles.placeInfo}>
            <Text style={styles.placeName} numberOfLines={1}>
              {place.name}
            </Text>
            <Text style={styles.placeAddr} numberOfLines={1}>
              {place.religion.charAt(0).toUpperCase() + place.religion.slice(1)} · {place.address}
            </Text>
            {(place.distance != null ||
              place.open_status === 'open' ||
              place.open_status === 'closed') && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                {place.distance != null && (
                  <Text style={[styles.placeAddr, { marginTop: 0 }]}>
                    {place.distance < 1
                      ? `${Math.round(place.distance * 1000)}m`
                      : `${place.distance.toFixed(1)}km`}
                  </Text>
                )}
                {place.open_status === 'open' && (
                  <Text style={{ fontSize: 10, fontWeight: '600', color: '#10b981' }}>Open</Text>
                )}
                {place.open_status === 'closed' && (
                  <Text style={{ fontSize: 10, fontWeight: '600', color: '#ef4444' }}>Closed</Text>
                )}
              </View>
            )}
          </View>
          <View style={[styles.placeCheck, selected && styles.placeCheckActive]}>
            {selected && <MaterialIcons name="check" size={14} color="#fff" />}
          </View>
        </TouchableOpacity>
      );
    };

    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.content, { flex: 1, paddingTop: insets.top + 16 }]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backBtn} onPress={goBack} activeOpacity={0.8}>
              <MaterialIcons
                name="arrow-back"
                size={20}
                color={isDark ? '#fff' : tokens.colors.textDark}
              />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('journey.newJourney') || 'New Journey'}</Text>
          </View>

          {renderStepIndicator()}

          {/* Selected places strip */}
          {selectedPlaces.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.selectedStrip}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {selectedPlaces.map((place, idx) => (
                <View key={place.place_code} style={styles.selectedChip}>
                  <View style={styles.chipNum}>
                    <Text style={styles.chipNumText}>{idx + 1}</Text>
                  </View>
                  <Text style={styles.chipName} numberOfLines={1}>
                    {place.name}
                  </Text>
                  <TouchableOpacity
                    style={styles.chipRemove}
                    onPress={() => togglePlace(place)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <MaterialIcons name="close" size={14} color={tokens.colors.primary} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Active filter context chip */}
          {(selectedCity || selectedFaith) && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: isDark ? 'rgba(196,112,84,0.2)' : 'rgba(196,112,84,0.1)',
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 20,
                }}
              >
                <MaterialIcons
                  name={selectedCity ? 'location-city' : 'auto-awesome'}
                  size={14}
                  color={tokens.colors.primary}
                />
                <Text style={{ fontSize: 12, fontWeight: '600', color: tokens.colors.primary }}>
                  {selectedCity
                    ? selectedCity.city
                    : selectedFaith
                      ? selectedFaith.charAt(0).toUpperCase() + selectedFaith.slice(1)
                      : ''}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    if (intent === 'city') {
                      setSelectedCity(null);
                      setBuildSubStep('city_pick');
                    } else if (intent === 'faith') {
                      setSelectedFaith(null);
                      setBuildSubStep('faith_pick');
                    }
                    setAllPlaces([]);
                  }}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <MaterialIcons name="close" size={14} color={tokens.colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Search */}
          <View style={styles.searchInput}>
            <MaterialIcons name="search" size={20} color={textMuted} />
            <TextInput
              style={styles.searchText}
              value={searchQuery}
              onChangeText={handleSearchChange}
              placeholder={t('common.search') || 'Search places…'}
              placeholderTextColor={textMuted}
              returnKeyType="search"
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => handleSearchChange('')}>
                <MaterialIcons name="close" size={18} color={textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {placesLoading ? (
            <ActivityIndicator color={tokens.colors.primary} style={{ marginTop: 24 }} />
          ) : (
            <FlatList
              data={allPlaces}
              keyExtractor={(p) => p.place_code}
              renderItem={renderPlaceItem}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.3}
              keyboardShouldPersistTaps="handled"
              ListFooterComponent={
                placesLoadingMore ? (
                  <ActivityIndicator color={tokens.colors.primary} style={{ marginVertical: 16 }} />
                ) : null
              }
            />
          )}
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity style={styles.cancelButton} onPress={goBack} activeOpacity={0.8}>
            <Text style={styles.cancelText}>{t('common.back')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.submitButton} onPress={goNext} activeOpacity={0.8}>
            <Text style={styles.submitText}>
              {selectedPlaces.length > 0
                ? `${t('common.next')} (${selectedPlaces.length})`
                : t('common.next')}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Polish step ─────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: 24 }]}
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
          <Text style={styles.headerTitle}>{t('journey.newJourney') || 'New Journey'}</Text>
        </View>

        {renderStepIndicator()}

        {/* Cover image */}
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

        {/* Name */}
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
            placeholder={t('groups.descriptionPlaceholder')}
            placeholderTextColor={textMuted}
            multiline
          />
        </View>

        {/* Date range */}
        <View style={styles.dateRow}>
          <View style={styles.dateCol}>
            <Text style={styles.label}>
              {t('groups.startDate')}
              <Text style={styles.optionalTag}> {t('groups.optional')}</Text>
            </Text>
            <TouchableOpacity
              style={styles.dateField}
              onPress={openStartPicker}
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
            <TouchableOpacity style={styles.dateField} onPress={openEndPicker} activeOpacity={0.8}>
              <MaterialIcons name="calendar-today" size={18} color={textMuted} />
              {endDate ? (
                <Text style={styles.dateText}>{formatDate(endDate)}</Text>
              ) : (
                <Text style={styles.datePlaceholder}>YYYY-MM-DD</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {showStartPicker &&
          (Platform.OS === 'ios' ? (
            renderIOSDatePicker(
              startDate ?? new Date(),
              setStartDate,
              cancelStartDate,
              confirmStartDate,
            )
          ) : (
            <DateTimePicker
              value={startDate ?? new Date()}
              mode="date"
              display="default"
              themeVariant={isDark ? 'dark' : 'light'}
              onChange={(_, date) => {
                setShowStartPicker(false);
                if (date) setStartDate(date);
              }}
            />
          ))}
        {showEndPicker &&
          (Platform.OS === 'ios' ? (
            renderIOSDatePicker(endDate ?? new Date(), setEndDate, cancelEndDate, confirmEndDate)
          ) : (
            <DateTimePicker
              value={endDate ?? new Date()}
              mode="date"
              display="default"
              themeVariant={isDark ? 'dark' : 'light'}
              onChange={(_, date) => {
                setShowEndPicker(false);
                if (date) setEndDate(date);
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
            {isPrivate ? <MaterialIcons name="check" size={16} color="#fff" /> : null}
          </View>
          <Text style={styles.checkLabel}>{t('groups.privateGroup')}</Text>
          <Text style={styles.optionalTag}>{t('groups.optional')}</Text>
        </TouchableOpacity>

        {/* Selected places summary */}
        {selectedPlaces.length > 0 && (
          <View style={styles.reviewCard}>
            <Text style={[styles.label, { fontSize: 13, marginBottom: 10 }]}>
              {t('journey.placesCount') || `${selectedPlaces.length} places`}
            </Text>
            {selectedPlaces.map((place, i) => (
              <View key={place.place_code} style={styles.reviewPlaceRow}>
                <Text style={styles.reviewPlaceIdx}>{i + 1}</Text>
                <Text style={styles.reviewPlaceName} numberOfLines={1}>
                  {place.name}
                </Text>
                <Text style={styles.reviewPlaceRel}>{place.religion}</Text>
              </View>
            ))}
          </View>
        )}

        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={styles.cancelButton} onPress={goBack} activeOpacity={0.8}>
          <Text style={styles.cancelText}>{t('common.back')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitDisabled]}
          onPress={goNext}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.submitText}>{t('journey.createJourney') || 'Create Journey'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
