/**
 * FeedbackPopup — centered success/error overlay with animated icon.
 * Auto-dismisses after 2.5 s. Triggers haptic feedback on show.
 */
import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, Animated, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { tokens } from '@/lib/theme';
import { useTheme } from '@/app/providers';

interface FeedbackPopupProps {
  visible: boolean;
  type: 'success' | 'error';
  message: string;
}

export default function FeedbackPopup({ visible, type, message }: FeedbackPopupProps) {
  const { isDark } = useTheme();
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.85)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Trigger haptic
      const hapticType =
        type === 'success'
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error;
      Haptics.notificationAsync(hapticType).catch(() => {});

      // Animate in
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(cardScale, {
          toValue: 1,
          stiffness: 350,
          damping: 28,
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(iconScale, {
            toValue: 1.05,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.spring(iconScale, {
            toValue: 1,
            stiffness: 400,
            damping: 20,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    } else {
      // Reset for next show
      backdropOpacity.setValue(0);
      cardScale.setValue(0.85);
      cardOpacity.setValue(0);
      iconScale.setValue(0);
    }
  }, [visible, type]);

  const isSuccess = type === 'success';
  const styles = makeStyles(isDark, isSuccess);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      {/* Backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}
      />

      {/* Centered card */}
      <View style={styles.centeredContainer}>
        <Animated.View
          style={[styles.card, { transform: [{ scale: cardScale }], opacity: cardOpacity }]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {/* Icon circle */}
          <Animated.View style={[styles.iconCircle, { transform: [{ scale: iconScale }] }]}>
            <MaterialIcons
              name={isSuccess ? 'check-circle' : 'cancel'}
              size={40}
              color={isSuccess ? tokens.colors.openNow : tokens.colors.closedNow}
            />
          </Animated.View>

          {/* Message */}
          <Text style={styles.message}>{message}</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

function makeStyles(isDark: boolean, isSuccess: boolean) {
  const iconBg = isSuccess ? tokens.colors.openNowBg : tokens.colors.closedNowBg;

  return StyleSheet.create({
    backdrop: {
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    centeredContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    card: {
      backgroundColor: isDark ? tokens.colors.darkSurface : '#ffffff',
      borderRadius: 28,
      paddingVertical: 32,
      paddingHorizontal: 40,
      alignItems: 'center',
      gap: 16,
      minWidth: 200,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 24,
      elevation: 16,
    },
    iconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: iconBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    message: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? '#ffffff' : tokens.colors.textDark,
      textAlign: 'center',
      lineHeight: 22,
    },
  });
}
