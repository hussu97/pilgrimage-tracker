import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { tokens } from '@/lib/theme';
import type { PlaceSpecification } from '@/lib/types';

// Map Material Symbols names (used in seed_data / web) to valid MaterialIcons names.
// MaterialIcons uses the older Material Design icon font; some newer icons are absent.
const SYMBOL_TO_ICON: Record<string, string> = {
  local_parking: 'directions-car',
  temple_hindu: 'place',
  checkroom: 'check-circle',
  church: 'place',
};

function safeIcon(name: string): React.ComponentProps<typeof MaterialIcons>['name'] {
  const mapped = SYMBOL_TO_ICON[name] ?? name.replace(/_/g, '-');
  return mapped as React.ComponentProps<typeof MaterialIcons>['name'];
}

interface Props {
  specifications: PlaceSpecification[];
  t: (key: string) => string;
  isDark?: boolean;
}

function makeStyles(isDark: boolean) {
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  const textMain = isDark ? '#ffffff' : tokens.colors.textMain;

  return StyleSheet.create({
    section: {
      marginHorizontal: 20,
      marginTop: 24,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: textMuted,
      textTransform: 'uppercase',
      letterSpacing: 2,
      marginBottom: 16,
    },
    specsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    specCard: {
      width: '47%',
      padding: 16,
      borderRadius: 16,
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: border,
      ...tokens.shadow.subtle,
    },
    specLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      marginBottom: 4,
    },
    specValue: {
      fontSize: 14,
      fontWeight: '600',
      color: textMain,
    },
  });
}

function PlaceSpecificationsGrid({ specifications, t, isDark = false }: Props) {
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('placeDetail.detailsAndFacilities')}</Text>
      <View style={styles.specsGrid}>
        {specifications.map((spec, i) => (
          <View key={i} style={styles.specCard}>
            <MaterialIcons
              name={safeIcon(spec.icon)}
              size={20}
              color={tokens.colors.primary}
              style={{ marginBottom: 6 }}
            />
            <Text style={styles.specLabel}>{t(spec.label)}</Text>
            <Text style={styles.specValue}>{spec.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default React.memo(PlaceSpecificationsGrid);
