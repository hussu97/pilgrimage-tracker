import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { tokens } from '../lib/theme';

interface FilterChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
}

function FilterChip({ label, selected = false, onPress }: FilterChipProps) {
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

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: tokens.borderRadius.xl,
    borderWidth: 1,
  },
  chipDefault: {
    backgroundColor: tokens.colors.surface,
    borderColor: tokens.colors.inputBorder,
  },
  chipSelected: {
    backgroundColor: tokens.colors.primary,
    borderColor: tokens.colors.primary,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  labelDefault: { color: tokens.colors.textSecondary },
  labelSelected: { color: '#fff' },
});
