import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation';
import { useI18n, useAuth } from '@/app/providers';
import { tokens } from '@/lib/theme';

export default function SplashScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Splash'>>();
  const { ready } = useI18n();
  const { loading } = useAuth();

  // Once auth and i18n are ready, always go to Main (Home tab).
  // If the user is not authenticated, the Profile tab will show the login landing page.
  useEffect(() => {
    if (ready && !loading) {
      navigation.replace('Main');
    }
  }, [ready, loading, navigation]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={tokens.colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
