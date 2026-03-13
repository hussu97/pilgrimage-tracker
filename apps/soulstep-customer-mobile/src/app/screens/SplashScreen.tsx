import { useEffect, useRef, useMemo } from 'react';
import { View, Animated, StyleSheet, Easing, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation';
import { useI18n, useAuth, useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';
import { MaterialIcons } from '@expo/vector-icons';

function makeStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? tokens.colors.darkBg : tokens.colors.backgroundLight,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    glowOuter: {
      position: 'absolute',
      width: 480,
      height: 480,
      borderRadius: 240,
      backgroundColor: isDark ? 'rgba(176,86,61,0.07)' : 'rgba(176,86,61,0.09)',
      top: '50%',
      left: '50%',
      marginTop: -240,
      marginLeft: -240,
    },
    glowInner: {
      position: 'absolute',
      width: 300,
      height: 300,
      borderRadius: 150,
      backgroundColor: isDark ? 'rgba(176,86,61,0.1)' : 'rgba(176,86,61,0.12)',
      top: '50%',
      left: '50%',
      marginTop: -150,
      marginLeft: -150,
    },
    orbitRingOuter: {
      position: 'absolute',
      width: 148,
      height: 148,
      borderRadius: 74,
      borderWidth: 1,
      borderColor: 'rgba(176,86,61,0.15)',
    },
    orbitRingInner: {
      position: 'absolute',
      width: 120,
      height: 120,
      borderRadius: 60,
      borderWidth: 2,
      borderColor: 'transparent',
      borderTopColor: tokens.colors.primary,
      borderRightColor: 'rgba(176,86,61,0.3)',
    },
    logoCard: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: isDark ? tokens.colors.darkSurface : '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#B0563D',
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.28,
      shadowRadius: 36,
      elevation: 12,
    },
    brandName: {
      fontSize: 40,
      fontWeight: '700',
      color: isDark ? '#FFFFFF' : tokens.colors.textMain,
      letterSpacing: -1,
      marginTop: 28,
    },
    tagline: {
      fontSize: 10,
      fontWeight: '600',
      color: tokens.colors.primary,
      letterSpacing: 3.5,
      textTransform: 'uppercase',
      marginTop: 8,
    },
    dotsRow: {
      flexDirection: 'row',
      gap: 7,
      marginTop: 64,
      alignItems: 'center',
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: tokens.colors.primary,
    },
  });
}

export default function SplashScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Splash'>>();
  const { ready } = useI18n();
  const { loading, user } = useAuth();
  const { isDark } = useTheme();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  // Animation values
  const logoScale = useRef(new Animated.Value(0.4)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoRotate = useRef(new Animated.Value(-0.04)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(20)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const dotsOpacity = useRef(new Animated.Value(0)).current;
  const ringInnerSpin = useRef(new Animated.Value(0)).current;
  const ringOuterSpin = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0.85)).current;
  const dot1 = useRef(new Animated.Value(0.5)).current;
  const dot2 = useRef(new Animated.Value(0.5)).current;
  const dot3 = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    // Logo spring entrance
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, tension: 55, friction: 7, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.spring(logoRotate, { toValue: 0, tension: 60, friction: 8, useNativeDriver: true }),
    ]).start();

    // Glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 1.08,
          duration: 2200,
          easing: Easing.inOut(Easing.sine),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0.85,
          duration: 2200,
          easing: Easing.inOut(Easing.sine),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // Inner ring spin (fast)
    Animated.loop(
      Animated.timing(ringInnerSpin, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();

    // Outer ring spin (slow, reverse)
    Animated.loop(
      Animated.timing(ringOuterSpin, {
        toValue: -1,
        duration: 10000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();

    // Brand name
    Animated.parallel([
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 550,
        delay: 320,
        useNativeDriver: true,
      }),
      Animated.timing(textY, {
        toValue: 0,
        duration: 550,
        delay: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Tagline
    Animated.timing(taglineOpacity, {
      toValue: 1,
      duration: 550,
      delay: 520,
      useNativeDriver: true,
    }).start();

    // Dots appear then loop
    Animated.timing(dotsOpacity, {
      toValue: 1,
      duration: 400,
      delay: 750,
      useNativeDriver: true,
    }).start(() => {
      const dotLoop = (dot: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.spring(dot, {
              toValue: 1.5,
              tension: 180,
              friction: 6,
              useNativeDriver: true,
            }),
            Animated.spring(dot, {
              toValue: 0.5,
              tension: 180,
              friction: 6,
              useNativeDriver: true,
            }),
            Animated.delay(600),
          ]),
        );
      dotLoop(dot1, 0).start();
      dotLoop(dot2, 200).start();
      dotLoop(dot3, 400).start();
    });
  }, []);

  // Navigate when ready
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

  const innerSpin = ringInnerSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const outerSpin = ringOuterSpin.interpolate({
    inputRange: [-1, 0],
    outputRange: ['-360deg', '0deg'],
  });
  const logoRotateDeg = logoRotate.interpolate({
    inputRange: [-0.04, 0],
    outputRange: ['-14deg', '0deg'],
  });

  return (
    <View style={styles.container}>
      {/* Ambient glow */}
      <Animated.View style={[styles.glowOuter, { transform: [{ scale: glowPulse }] }]} />
      <Animated.View style={[styles.glowInner, { transform: [{ scale: glowPulse }] }]} />

      {/* Logo with spinning orbit rings */}
      <Animated.View
        style={{
          opacity: logoOpacity,
          transform: [{ scale: logoScale }, { rotate: logoRotateDeg }],
        }}
      >
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          {/* Outer slow ring */}
          <Animated.View
            style={[
              styles.orbitRingOuter,
              { position: 'absolute', transform: [{ rotate: outerSpin }] },
            ]}
          />
          {/* Inner fast ring */}
          <Animated.View
            style={[
              styles.orbitRingInner,
              { position: 'absolute', transform: [{ rotate: innerSpin }] },
            ]}
          />
          {/* Logo card */}
          <View style={styles.logoCard}>
            <MaterialIcons name="explore" size={44} color={tokens.colors.primary} />
          </View>
        </View>
      </Animated.View>

      {/* Brand name */}
      <Animated.Text
        style={[styles.brandName, { opacity: textOpacity, transform: [{ translateY: textY }] }]}
      >
        SoulStep
      </Animated.Text>

      {/* Tagline */}
      <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
        Sacred Sites · Every Step
      </Animated.Text>

      {/* Bouncing dots */}
      <Animated.View style={[styles.dotsRow, { opacity: dotsOpacity }]}>
        <Animated.View style={[styles.dot, { transform: [{ scale: dot1 }] }]} />
        <Animated.View style={[styles.dot, { transform: [{ scale: dot2 }] }]} />
        <Animated.View style={[styles.dot, { transform: [{ scale: dot3 }] }]} />
      </Animated.View>
    </View>
  );
}
