import React, { useMemo } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { tokens } from '@/lib/theme';

interface FilterChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  isDark?: boolean;
}

function makeStyles(isDark: boolean) {
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const labelDefault = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary;

  return StyleSheet.create({
    chip: {
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: tokens.borderRadius.xl,
      borderWidth: 1,
    },
    chipDefault: {
      backgroundColor: surface,
      borderColor: border,
    },
    chipSelected: {
      backgroundColor: tokens.colors.primary,
      borderColor: tokens.colors.primary,
    },
    label: {
      fontSize: 14,
      fontWeight: '500',
    },
    labelDefault: { color: labelDefault },
    labelSelected: { color: '#fff' },
  });
}

function FilterChip({ label, selected = false, onPress, isDark = false }: FilterChipProps) {
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.chip, selected ? styles.chipSelected : styles.chipDefault]}
    >
      <Text style={[styles.label, selected ? styles.labelSelected : styles.labelDefault]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default React.memo(FilterChip);
