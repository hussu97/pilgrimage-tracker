import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { tokens } from '@/lib/theme';

interface HomeHeaderProps {
  displayName: string;
  viewMode: 'list' | 'map';
  onViewModeToggle: () => void;
  isDark: boolean;
  t: (key: string) => string;
}

export default function HomeHeader({
  displayName,
  viewMode,
  onViewModeToggle,
  isDark,
  t,
}: HomeHeaderProps) {
  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;
  const toggleGroupBg = isDark ? tokens.colors.darkSurface : '#f1f5f9';

  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Text style={[styles.greeting, { color: textMain }]}>
          {t('home.greeting')} <Text style={styles.greetingName}>{displayName}</Text>
        </Text>
        <View style={[styles.toggleGroup, { backgroundColor: toggleGroupBg }]}>
          <TouchableOpacity
            onPress={onViewModeToggle}
            style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
          >
            <MaterialIcons
              name="view-list"
              size={18}
              color={viewMode === 'list' ? '#fff' : textMain}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onViewModeToggle}
            style={[styles.toggleBtn, viewMode === 'map' && styles.toggleBtnActive]}
          >
            <MaterialIcons name="map" size={18} color={viewMode === 'map' ? '#fff' : textMain} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 22,
    fontWeight: '400',
    letterSpacing: -0.3,
  },
  greetingName: {
    fontWeight: '700',
  },
  toggleGroup: {
    flexDirection: 'row',
    borderRadius: tokens.borderRadius.xl,
    padding: 4,
    gap: 4,
  },
  toggleBtn: {
    width: 36,
    height: 36,
    borderRadius: tokens.borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnActive: {
    backgroundColor: tokens.colors.primary,
  },
});
