import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useI18n, useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';
import type { Place } from '@/lib/types';

const RELIGION_FILTERS = ['all', 'islam', 'hinduism', 'christianity'] as const;

interface PlaceSelectorProps {
  selectedCodes: string[];
  onChange: (codes: string[]) => void;
  places: Place[];
  loading?: boolean;
}

function makeStyles(isDark: boolean) {
  const bg = isDark ? tokens.colors.darkBg : tokens.colors.backgroundLight;
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

  return StyleSheet.create({
    container: { flex: 1 },
    selectedBox: {
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    selectedHeader: { fontSize: 12, fontWeight: '600', color: textMuted, marginBottom: 8 },
    selectedItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 8,
      backgroundColor: isDark ? '#1a2e50' : '#f0f4ff',
      borderRadius: 8,
      marginBottom: 4,
    },
    selectedIndex: { fontSize: 12, fontWeight: '700', color: tokens.colors.primary, width: 20 },
    selectedName: { flex: 1, fontSize: 13, fontWeight: '500', color: textMain },
    moveBtn: { padding: 4 },
    moveBtnText: { fontSize: 16, color: tokens.colors.primary },
    removeBtn: { padding: 4 },
    removeBtnText: { fontSize: 16, color: '#ef4444' },
    searchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    searchInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: textMain,
      backgroundColor: surface,
    },
    filterRow: { flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
    },
    chipSelected: {
      backgroundColor: tokens.colors.primary,
      borderColor: tokens.colors.primary,
    },
    chipText: { fontSize: 12, fontWeight: '600', color: textMuted },
    chipTextSelected: { color: '#ffffff' },
    placeItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 10,
      marginBottom: 2,
    },
    placeItemSelected: {
      backgroundColor: isDark ? '#1a2e50' : '#f0f4ff',
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: border,
      marginRight: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxSelected: {
      backgroundColor: tokens.colors.primary,
      borderColor: tokens.colors.primary,
    },
    checkmark: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
    placeName: { fontSize: 13, fontWeight: '500', color: textMain },
    placeSubtext: { fontSize: 11, color: textMuted, marginTop: 1 },
    emptyText: { textAlign: 'center', color: textMuted, padding: 20 },
  });
}

export default function PlaceSelector({
  selectedCodes,
  onChange,
  places,
  loading,
}: PlaceSelectorProps) {
  const { t } = useI18n();
  const { isDark } = useTheme();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  const [search, setSearch] = useState('');
  const [religionFilter, setReligionFilter] = useState<string>('all');

  const filteredPlaces = useMemo(
    () =>
      places.filter((p) => {
        const matchesSearch = search === '' || p.name.toLowerCase().includes(search.toLowerCase());
        const matchesReligion = religionFilter === 'all' || p.religion === religionFilter;
        return matchesSearch && matchesReligion;
      }),
    [places, search, religionFilter],
  );

  const togglePlace = useCallback(
    (code: string) => {
      if (selectedCodes.includes(code)) {
        onChange(selectedCodes.filter((c) => c !== code));
      } else {
        onChange([...selectedCodes, code]);
      }
    },
    [selectedCodes, onChange],
  );

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...selectedCodes];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };

  const moveDown = (index: number) => {
    if (index === selectedCodes.length - 1) return;
    const next = [...selectedCodes];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  };

  const selectedPlaces = selectedCodes
    .map((code) => places.find((p) => p.place_code === code))
    .filter(Boolean) as Place[];

  return (
    <View style={styles.container}>
      {selectedPlaces.length > 0 && (
        <View style={styles.selectedBox}>
          <Text style={styles.selectedHeader}>
            {t('groups.placesSelected').replace('{count}', String(selectedPlaces.length))}
          </Text>
          {selectedPlaces.map((place, i) => (
            <View key={place.place_code} style={styles.selectedItem}>
              <Text style={styles.selectedIndex}>{i + 1}</Text>
              <Text style={styles.selectedName} numberOfLines={1}>
                {place.name}
              </Text>
              <TouchableOpacity style={styles.moveBtn} onPress={() => moveUp(i)} disabled={i === 0}>
                <Text style={styles.moveBtnText}>↑</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.moveBtn}
                onPress={() => moveDown(i)}
                disabled={i === selectedPlaces.length - 1}
              >
                <Text style={styles.moveBtnText}>↓</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => togglePlace(place.place_code)}
              >
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <TextInput
        style={styles.searchInput}
        value={search}
        onChangeText={setSearch}
        placeholder={t('groups.searchPlaces')}
        placeholderTextColor={isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted}
      />

      <View style={styles.filterRow}>
        {RELIGION_FILTERS.map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.chip, religionFilter === r && styles.chipSelected]}
            onPress={() => setReligionFilter(r)}
          >
            <Text style={[styles.chipText, religionFilter === r && styles.chipTextSelected]}>
              {r === 'all' ? t('common.allReligions') : t(`common.${r}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={tokens.colors.primary} style={{ marginTop: 20 }} />
      ) : filteredPlaces.length === 0 ? (
        <Text style={styles.emptyText}>{t('home.noPlacesFound')}</Text>
      ) : (
        <FlatList
          data={filteredPlaces}
          keyExtractor={(item) => item.place_code}
          renderItem={({ item }) => {
            const checked = selectedCodes.includes(item.place_code);
            return (
              <TouchableOpacity
                style={[styles.placeItem, checked && styles.placeItemSelected]}
                onPress={() => togglePlace(item.place_code)}
              >
                <View style={[styles.checkbox, checked && styles.checkboxSelected]}>
                  {checked && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.placeName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.placeSubtext} numberOfLines={1}>
                    {item.religion} · {item.address}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
          scrollEnabled={false}
        />
      )}
    </View>
  );
}
