import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { tokens } from '@/lib/theme';
import type { PlaceSpecification } from '@/lib/types';

interface Props {
  specifications: PlaceSpecification[];
  t: (key: string) => string;
}

function PlaceSpecificationsGrid({ specifications, t }: Props) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('placeDetail.detailsAndFacilities')}</Text>
      <View style={styles.specsGrid}>
        {specifications.map((spec, i) => (
          <View key={i} style={styles.specCard}>
            <MaterialIcons
              name={spec.icon as any}
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

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 20,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: tokens.colors.textMuted,
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
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    ...tokens.shadow.subtle,
  },
  specLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: tokens.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  specValue: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.colors.textMain,
  },
});
