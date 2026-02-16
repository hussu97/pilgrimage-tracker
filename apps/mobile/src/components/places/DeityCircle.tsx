import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { tokens } from '../../lib/theme';
import type { PlaceTiming } from '../../lib/types';

interface DeityCircleProps {
  item: PlaceTiming;
}

export default function DeityCircle({ item }: DeityCircleProps) {
  return (
    <View style={styles.item}>
      <View style={[styles.circle, styles.deityCircle]}>
        {item.image_url ? (
          <Image
            source={{ uri: item.image_url }}
            style={styles.deityImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
          />
        ) : (
          <Text style={styles.deityEmoji}>🛕</Text>
        )}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {item.name}
      </Text>
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
  deityCircle: {
    borderColor: 'rgba(197, 160, 89, 0.4)',
    backgroundColor: tokens.colors.surface,
    overflow: 'hidden',
  },
  name: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    color: tokens.colors.textMain,
    textTransform: 'capitalize',
  },
  subtitle: {
    fontSize: 10,
    color: tokens.colors.textMuted,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  deityImage: {
    width: '100%',
    height: '100%',
  },
  deityEmoji: {
    fontSize: 32,
  },
});
