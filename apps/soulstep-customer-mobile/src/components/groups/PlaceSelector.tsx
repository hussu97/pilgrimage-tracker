import React, { useCallback, useMemo } from 'react';
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
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import type { Place } from '@/lib/types';
import { formatDistance } from '@/lib/utils/place-utils';

interface PlaceSelectorProps {
  selectedCodes: string[];
  onChange: (codes: string[]) => void;
  places: Place[];
  loading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onSearchChange?: (text: string) => void;
  searchValue?: string;
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
    placeMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 3,
    },
    placeMetaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    placeMetaText: { fontSize: 11, color: textMuted },
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
  onLoadMore,
  hasMore,
  loadingMore,
  onSearchChange,
  searchValue,
}: PlaceSelectorProps) {
  const { t } = useI18n();
  const { isDark } = useTheme();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

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

  const renderHeader = () => (
    <View>
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
        value={searchValue ?? ''}
        onChangeText={onSearchChange}
        placeholder={t('groups.searchPlaces')}
        placeholderTextColor={textMuted}
      />
    </View>
  );

  const renderFooter = () => {
    if (loadingMore) {
      return <ActivityIndicator color={tokens.colors.primary} style={{ marginVertical: 16 }} />;
    }
    return null;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <ActivityIndicator color={tokens.colors.primary} style={{ marginTop: 20 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={places}
        keyExtractor={(item) => item.place_code}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('home.noPlacesFound')}</Text>}
        onEndReached={hasMore ? onLoadMore : undefined}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
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
                    source={{ uri: getFullImageUrl(item.images[0].url) }}
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
                {(item.distance != null || item.total_checkins_count != null) && (
                  <View style={styles.placeMeta}>
                    {item.distance != null && (
                      <View style={styles.placeMetaItem}>
                        <MaterialIcons name="near-me" size={11} color={textMuted} />
                        <Text style={styles.placeMetaText}>{formatDistance(item.distance)}</Text>
                      </View>
                    )}
                    {item.total_checkins_count != null && (
                      <View style={styles.placeMetaItem}>
                        <MaterialIcons name="check-circle" size={11} color={textMuted} />
                        <Text style={styles.placeMetaText}>{item.total_checkins_count}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
              {checked && (
                <View style={styles.checkBadge}>
                  <MaterialIcons name="check" size={14} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}
