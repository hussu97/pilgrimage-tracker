import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { tokens } from '@/lib/theme';
import type { PlaceTiming } from '@/lib/types';

interface TimingCircleProps {
  item: PlaceTiming;
}

export default function TimingCircle({ item }: TimingCircleProps) {
  const statusColor =
    item.status === 'current' ? tokens.colors.primary :
    item.status === 'past' ? tokens.colors.textMuted : tokens.colors.textSecondary;
  const borderColor =
    item.status === 'current' ? tokens.colors.primary :
    item.status === 'past' ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.15)';
  const bgColor =
    item.status === 'current' ? `${tokens.colors.primary}18` : tokens.colors.surface;

  return (
    <View style={styles.item}>
      <View style={[styles.circle, { borderColor, backgroundColor: bgColor }]}>
        <Text style={[styles.name, { color: statusColor }]} numberOfLines={1}>
          {item.name.charAt(0).toUpperCase() + item.name.slice(1)}
        </Text>
        {item.time ? (
          <Text style={[styles.time, { color: statusColor }]} numberOfLines={1}>
            {item.time}
          </Text>
        ) : null}
        {item.status === 'past' && (
          <MaterialIcons name="check" size={10} color={tokens.colors.textMuted} style={{ marginTop: 2 }} />
        )}
        {item.status === 'current' && (
          <View style={styles.currentDot} />
        )}
      </View>
      {item.subtitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>{item.subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    alignItems: 'center',
    minWidth: 80,
    maxWidth: 90,
  },
  circle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    padding: 4,
  },
  name: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    color: tokens.colors.textMain,
    textTransform: 'capitalize',
  },
  time: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
  },
  subtitle: {
    fontSize: 10,
    color: tokens.colors.textMuted,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  currentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.primary,
    marginTop: 3,
  },
});
