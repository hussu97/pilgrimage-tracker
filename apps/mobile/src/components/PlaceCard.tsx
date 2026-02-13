import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../app/navigation';
import type { Place } from '../lib/types';

interface PlaceCardProps {
  place: Place;
}

export default function PlaceCard({ place }: PlaceCardProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'PlaceDetail'>>();
  const imageUrl = place.image_urls?.[0] ?? '';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('PlaceDetail', { placeCode: place.place_code })}
      activeOpacity={0.9}
    >
      <View style={styles.imageWrap}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.placeholderIcon}>⊕</Text>
          </View>
        )}
        {place.user_has_checked_in ? (
          <View style={styles.visitedBadge}>
            <Text style={styles.visitedText}>✓ Visited</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>{place.name}</Text>
        <Text style={styles.address} numberOfLines={1}>{place.address || place.place_type}</Text>
        {place.distance != null ? (
          <Text style={styles.distance}>
            {place.distance < 1
              ? `${Math.round(place.distance * 1000)} m`
              : `${place.distance.toFixed(1)} km`}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  imageWrap: { height: 160, backgroundColor: '#f3f4f6', position: 'relative' },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholderIcon: { fontSize: 40, color: '#9ca3af' },
  visitedBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(13, 148, 136, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  visitedText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  body: { padding: 16 },
  name: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 4 },
  address: { fontSize: 14, color: '#6b7280', marginBottom: 4 },
  distance: { fontSize: 12, color: '#0d9488', fontWeight: '600' },
});
