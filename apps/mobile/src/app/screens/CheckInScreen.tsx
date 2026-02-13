import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation';
import { useI18n } from '../providers';
import { tokens } from '../../lib/theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'CheckIn'>;
type CheckInRoute = RouteProp<RootStackParamList, 'CheckIn'>;

export default function CheckInScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<CheckInRoute>();
  const { placeCode } = route.params ?? {};
  const { t } = useI18n();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        activeOpacity={0.8}
      >
        <Text style={styles.backText}>‹ {t('common.back')}</Text>
      </TouchableOpacity>
      <View style={styles.centered}>
        <Text style={styles.title}>Check In</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.surfaceTint },
  content: { paddingHorizontal: 24 },
  backButton: { marginBottom: 16 },
  backText: { fontSize: 16, color: tokens.colors.textMuted },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 },
  title: { fontSize: 24, fontWeight: '600', color: tokens.colors.textDark },
});
