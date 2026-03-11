import { useEffect, useMemo } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation';
import { useI18n, useAuth, useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';

function makeStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? tokens.colors.darkBg : tokens.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

export default function SplashScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Splash'>>();
  const { ready } = useI18n();
  const { loading, user } = useAuth();
  const { isDark } = useTheme();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  // Once auth and i18n are ready, decide where to navigate:
  // - If no user AND onboarding not done → Onboarding
  // - If user exists OR onboarding done → Main
  useEffect(() => {
    if (!ready || loading) return;
    (async () => {
      try {
        const done = await AsyncStorage.getItem('onboarding_done');
        if (!done && !user) {
          navigation.replace('Onboarding');
        } else {
          navigation.replace('Main');
        }
      } catch {
        navigation.replace('Main');
      }
    })();
  }, [ready, loading, user, navigation]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={tokens.colors.primary} />
    </View>
  );
}
