import { ScrollView, StyleSheet, TouchableOpacity, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { tokens } from '@/lib/theme';
import FilterChip from './FilterChip';

interface ActiveFilters {
  placeType?: string;
  openNow?: boolean;
  hasParking?: boolean;
  womensArea?: boolean;
  hasEvents?: boolean;
  topRated?: boolean;
}

interface FilterChipsListProps {
  activeFilters: ActiveFilters;
  placeTypes: string[];
  onFilterToggle: (key: string, value?: any) => void;
  onClearAll: () => void;
  isDark: boolean;
  t: (key: string) => string;
}

export default function FilterChipsList({
  activeFilters,
  placeTypes,
  onFilterToggle,
  onClearAll,
  isDark,
  t,
}: FilterChipsListProps) {
  const hasAnyFilter =
    activeFilters.placeType ||
    activeFilters.openNow ||
    activeFilters.hasParking ||
    activeFilters.womensArea ||
    activeFilters.hasEvents ||
    activeFilters.topRated;

  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;

  return (
    <View style={styles.chipArea}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipScroll}
      >
        {placeTypes.map((pt) => (
          <FilterChip
            key={pt}
            label={pt}
            selected={activeFilters.placeType === pt}
            onPress={() => onFilterToggle('placeType', activeFilters.placeType === pt ? undefined : pt)}
          />
        ))}
        {hasAnyFilter && (
          <TouchableOpacity onPress={onClearAll} style={styles.clearBtn}>
            <Text style={[styles.clearText, { color: textMain }]}>{t('home.clearFilters')}</Text>
            <MaterialIcons name="close" size={14} color={textMain} />
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  chipArea: {
    marginBottom: 8,
  },
  chipScroll: {
    paddingHorizontal: 24,
    gap: 8,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: tokens.borderRadius.full,
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    gap: 4,
  },
  clearText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
