import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import type { RootStackParamList } from '@/app/navigation';
import type { NearbyPlace } from '@/lib/types';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import { useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PlaceDetail'>;

interface NearbyPlacesProps {
  title: string;
  places?: NearbyPlace[];
}

export default function NearbyPlaces({ title, places }: NearbyPlacesProps) {
  const navigation = useNavigation<Nav>();
  const { isDark } = useTheme();
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
          const imgUrl = place.image_url ? getFullImageUrl(place.image_url) : null;
          return (
            <TouchableOpacity
              key={place.place_code}
              style={s.card}
              onPress={() =>
                navigation.push('PlaceDetail', {
                  placeCode: place.place_code,
                  slug: place.seo_slug,
                })
              }
              activeOpacity={0.8}
            >
              <View style={s.imgWrapper}>
                {imgUrl ? (
                  <ExpoImage source={{ uri: imgUrl }} style={s.img} contentFit="cover" />
                ) : (
                  <View style={[s.img, s.imgPlaceholder]}>
                    <MaterialIcons name="place" size={20} color={tokens.colors.textMuted} />
                  </View>
                )}
              </View>
              <View style={s.info}>
                <Text style={s.name} numberOfLines={2}>
                  {place.name}
                </Text>
                {place.average_rating != null && (
                  <View style={s.ratingRow}>
                    <MaterialIcons name="star" size={11} color={tokens.colors.goldRank} />
                    <Text style={s.rating}>{place.average_rating.toFixed(1)}</Text>
                  </View>
                )}
                <Text style={s.religion}>{place.religion}</Text>
              </View>
            </TouchableOpacity>
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
    card: {
      width: 140,
      borderRadius: tokens.borderRadius['2xl'],
      backgroundColor: isDark ? tokens.colors.darkSurface : '#fff',
      borderWidth: 1,
      borderColor: isDark ? tokens.colors.darkBorder : '#e5e7eb',
      overflow: 'hidden',
      ...tokens.shadow.card,
    },
    imgWrapper: {
      height: 90,
    },
    img: {
      width: '100%',
      height: '100%',
    },
    imgPlaceholder: {
      backgroundColor: isDark ? tokens.colors.darkBg : '#f1f5f9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    info: {
      padding: 8,
    },
    name: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#fff' : tokens.colors.textMain,
      marginBottom: 4,
    },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      marginBottom: 2,
    },
    rating: {
      fontSize: 10,
      fontWeight: '600',
      color: tokens.colors.goldRank,
    },
    religion: {
      fontSize: 10,
      color: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted,
      textTransform: 'capitalize',
    },
  });
}
