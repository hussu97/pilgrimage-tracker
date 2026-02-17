import { useRef } from 'react';
import { Animated, PanResponder, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const DELETE_WIDTH = 80;
const SWIPE_THRESHOLD = DELETE_WIDTH * 0.5;

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  deleteLabel?: string;
  deleteColor?: string;
  deleteIcon?: string;
}

/**
 * Wraps a row with a swipe-to-reveal-action affordance.
 * Swipe left to reveal the delete/action button; swipe right to close.
 */
export default function SwipeableRow({
  children,
  onDelete,
  deleteLabel = 'Remove',
  deleteColor = '#EF4444',
  deleteIcon = 'delete',
}: SwipeableRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;

  const closeRow = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 3,
    }).start();
  };

  const openRow = () => {
    Animated.spring(translateX, {
      toValue: -DELETE_WIDTH,
      useNativeDriver: true,
      bounciness: 2,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      // Only claim the gesture if horizontal motion is dominant
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > Math.abs(gs.dy * 1.5) && Math.abs(gs.dx) > 8,
      onPanResponderMove: (_, gs) => {
        const clamped = Math.max(gs.dx, -DELETE_WIDTH * 1.1);
        if (gs.dx <= 0) translateX.setValue(clamped);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -SWIPE_THRESHOLD) {
          openRow();
        } else {
          closeRow();
        }
      },
      onPanResponderTerminate: () => closeRow(),
    })
  ).current;

  const handleAction = () => {
    closeRow();
    onDelete();
  };

  return (
    <View style={styles.container}>
      {/* Action button revealed on swipe */}
      <View
        style={[
          styles.actionContainer,
          { backgroundColor: deleteColor, width: DELETE_WIDTH },
        ]}
      >
        <TouchableOpacity style={styles.actionButton} onPress={handleAction} activeOpacity={0.8}>
          <MaterialIcons name={deleteIcon as any} size={20} color="#fff" />
          <Text style={styles.actionLabel}>{deleteLabel}</Text>
        </TouchableOpacity>
      </View>

      {/* Swipeable content */}
      <Animated.View
        {...panResponder.panHandlers}
        style={{ transform: [{ translateX }] }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  actionContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButton: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
});
