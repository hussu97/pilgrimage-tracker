import { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
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

type Nav = NativeStackNavigationProp<RootStackParamList, 'EditGroupPlaces'>;
type RouteT = RouteProp<RootStackParamList, 'EditGroupPlaces'>;

function makeStyles(isDark: boolean) {
  const bg = isDark ? tokens.colors.darkBg : tokens.colors.surfaceTint;
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: bg },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: border,
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
    saveBtn: {
      height: 36,
      paddingHorizontal: 16,
      borderRadius: 10,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtnDisabled: { opacity: 0.6 },
    saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    body: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  });
}

export default function EditGroupPlacesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const { groupCode } = route.params;
  const { t } = useI18n();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [placesLoading, setPlacesLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [g, members] = await Promise.all([getGroup(groupCode), getGroupMembers(groupCode)]);
      const isAdmin = members.some((m) => m.user_code === user?.user_code && m.role === 'admin');
      if (!isAdmin) {
        navigation.goBack();
        return;
      }
      setSelectedCodes(g.path_place_codes ?? []);
    } catch {
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [groupCode, user?.user_code, navigation]);

  useEffect(() => {
    fetchData();
    getPlaces({ limit: 200 })
      .then((res) => setPlaces(res.places ?? []))
      .catch(() => {})
      .finally(() => setPlacesLoading(false));
  }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateGroup(groupCode, { path_place_codes: selectedCodes });
      navigation.goBack();
    } catch (err) {
      Alert.alert(t('common.error'), err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={tokens.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.headerRow, { paddingTop: insets.top + 12 }]}>
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
        <Text style={styles.headerTitle}>{t('groups.manageItinerary')}</Text>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>{t('groups.saveItinerary')}</Text>
          )}
        </TouchableOpacity>
      </View>
      <View style={styles.body}>
        <PlaceSelector
          selectedCodes={selectedCodes}
          onChange={setSelectedCodes}
          places={places}
          loading={placesLoading}
        />
      </View>
    </View>
  );
}
