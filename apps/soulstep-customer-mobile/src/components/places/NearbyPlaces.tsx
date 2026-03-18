import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation';
import type { NearbyPlace } from '@/lib/types';
import type { Place } from '@/lib/types';
import { useTheme, useI18n } from '@/app/providers';
import { tokens } from '@/lib/theme';
import PlaceCard from './PlaceCard';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PlaceDetail'>;

interface NearbyPlacesProps {
  title: string;
  places?: NearbyPlace[];
}

export default function NearbyPlaces({ title, places }: NearbyPlacesProps) {
  const { isDark } = useTheme();
  const { t } = useI18n();
  const s = makeStyles(isDark);

  if (!places || places.length === 0) return null;

  return (
    <View style={s.container}>
      <Text style={s.heading}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.scroll}
      >
        {places.map((place) => {
          // Normalize NearbyPlace to the shape PlaceCard expects
          const placeObj = {
            place_code: place.place_code,
            name: place.name,
            address: '',
            images: place.image_url ? [{ url: place.image_url }] : [],
            average_rating: place.average_rating ?? null,
          } as unknown as Place;

          return (
            <View key={place.place_code} style={s.cardWrap}>
              <PlaceCard place={placeObj} variant="tile" />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function makeStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      marginTop: 16,
    },
    heading: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#fff' : tokens.colors.textMain,
      marginBottom: 10,
      paddingHorizontal: 16,
    },
    scroll: {
      paddingHorizontal: 16,
      gap: 12,
    },
    cardWrap: {
      width: 180,
    },
  });
}
