import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useI18n, useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';
import type { Place } from '@/lib/types';

interface PlaceSelectorProps {
  selectedCodes: string[];
  onChange: (codes: string[]) => void;
  places: Place[];
  loading?: boolean;
}

function makeStyles(isDark: boolean) {
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

  return StyleSheet.create({
    container: { flex: 1 },
    // Selected chips
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(59,130,246,0.3)' : 'rgba(59,130,246,0.2)',
    },
    chipIndex: { fontSize: 11, fontWeight: '700', color: tokens.colors.primary },
    chipName: { fontSize: 11, fontWeight: '500', color: textMain },
    chipBtnWrap: { flexDirection: 'row', gap: 2, marginLeft: 4 },
    chipBtn: { padding: 2 },
    chipsHeader: { fontSize: 12, fontWeight: '600', color: textMuted, marginBottom: 8 },
    // Search
    searchInput: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: textMain,
      backgroundColor: surface,
      marginBottom: 12,
    },
    // Place card
    placeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
      marginBottom: 8,
    },
    placeCardSelected: {
      borderWidth: 2,
      borderColor: tokens.colors.primary,
      backgroundColor: isDark ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.03)',
    },
    placeImage: {
      width: 52,
      height: 52,
      borderRadius: 10,
      backgroundColor: isDark ? tokens.colors.darkBorder : '#f1f5f9',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    placeImg: { width: 52, height: 52 },
    placeName: { fontSize: 14, fontWeight: '500', color: textMain },
    placeAddress: { fontSize: 11, color: textMuted, marginTop: 2 },
    checkBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
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

  const filteredPlaces = useMemo(
    () =>
      places.filter((p) => {
        return search === '' || p.name.toLowerCase().includes(search.toLowerCase());
      }),
    [places, search],
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

  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

  return (
    <View style={styles.container}>
      {selectedPlaces.length > 0 && (
        <View>
          <Text style={styles.chipsHeader}>
            {t('groups.placesSelected').replace('{count}', String(selectedPlaces.length))}
          </Text>
          <View style={styles.chipsWrap}>
            {selectedPlaces.map((place, i) => (
              <View key={place.place_code} style={styles.chip}>
                <Text style={styles.chipIndex}>{i + 1}</Text>
                <Text style={styles.chipName} numberOfLines={1}>
                  {place.name}
                </Text>
                <View style={styles.chipBtnWrap}>
                  <TouchableOpacity
                    style={styles.chipBtn}
                    onPress={() => moveUp(i)}
                    disabled={i === 0}
                  >
                    <MaterialIcons name="arrow-upward" size={12} color={tokens.colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.chipBtn}
                    onPress={() => moveDown(i)}
                    disabled={i === selectedPlaces.length - 1}
                  >
                    <MaterialIcons name="arrow-downward" size={12} color={tokens.colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.chipBtn}
                    onPress={() => togglePlace(place.place_code)}
                  >
                    <MaterialIcons name="close" size={12} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      <TextInput
        style={styles.searchInput}
        value={search}
        onChangeText={setSearch}
        placeholder={t('groups.searchPlaces')}
        placeholderTextColor={textMuted}
      />

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
                style={[styles.placeCard, checked && styles.placeCardSelected]}
                onPress={() => togglePlace(item.place_code)}
                activeOpacity={0.9}
              >
                <View style={styles.placeImage}>
                  {item.images?.[0]?.url ? (
                    <Image
                      source={{ uri: item.images[0].url }}
                      style={styles.placeImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <MaterialIcons name="place" size={24} color={textMuted} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.placeName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.placeAddress} numberOfLines={1}>
                    {item.address}
                  </Text>
                </View>
                {checked && (
                  <View style={styles.checkBadge}>
                    <MaterialIcons name="check" size={14} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
          scrollEnabled={false}
        />
      )}
    </View>
  );
}
