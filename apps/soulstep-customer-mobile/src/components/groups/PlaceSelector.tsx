import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useI18n, useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';
import type { Place } from '@/lib/types';
import PlaceListRow from '@/components/places/PlaceListRow';

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
  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;

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
    checkBadge: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: { textAlign: 'center', color: textMuted, padding: 20 },
    gap8: { marginBottom: 8 },
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
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => {
          const checked = selectedCodes.includes(item.place_code);
          return (
            <PlaceListRow
              place={item}
              t={t}
              isHighlighted={checked}
              onPress={() => togglePlace(item.place_code)}
              rightSlot={
                checked ? (
                  <View style={styles.checkBadge}>
                    <MaterialIcons name="check" size={14} color="#fff" />
                  </View>
                ) : undefined
              }
            />
          );
        }}
      />
    </View>
  );
}
