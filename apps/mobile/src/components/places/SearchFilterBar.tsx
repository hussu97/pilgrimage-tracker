import { View, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { tokens } from '@/lib/theme';

interface SearchFilterBarProps {
  search: string;
  onSearchChange: (text: string) => void;
  onFilterPress: () => void;
  hasActiveFilters: boolean;
  isDark: boolean;
  t: (key: string) => string;
}

export default function SearchFilterBar({
  search,
  onSearchChange,
  onFilterPress,
  hasActiveFilters,
  isDark,
  t,
}: SearchFilterBarProps) {
  const surface = isDark ? tokens.colors.darkSurface : '#ffffff';
  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

  return (
    <View style={styles.searchRow}>
      <View style={[styles.searchWrap, { backgroundColor: surface }]}>
        <MaterialIcons name="search" size={20} color={textMuted} />
        <TextInput
          style={[styles.searchInput, { color: textMain }]}
          placeholder={t('home.findPlace')}
          placeholderTextColor={textMuted}
          value={search}
          onChangeText={onSearchChange}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <TouchableOpacity
        onPress={onFilterPress}
        style={[
          styles.filterBtn,
          hasActiveFilters && styles.filterBtnActive,
          { backgroundColor: hasActiveFilters ? tokens.colors.primary : surface }
        ]}
      >
        <MaterialIcons name="tune" size={20} color={hasActiveFilters ? '#fff' : textMain} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginBottom: 16,
    gap: 12,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: tokens.borderRadius['2xl'],
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    marginLeft: 8,
  },
  filterBtn: {
    width: 48,
    height: 48,
    borderRadius: tokens.borderRadius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  filterBtnActive: {
    shadowColor: tokens.colors.primary,
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 6,
  },
});
