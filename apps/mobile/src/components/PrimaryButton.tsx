import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { tokens } from '../lib/theme';

interface PrimaryButtonProps {
  onPress: () => void;
  children: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

export default function PrimaryButton({
  onPress,
  children,
  variant = 'primary',
  disabled = false,
}: PrimaryButtonProps) {
  const isSecondary = variant === 'secondary';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[
        styles.button,
        isSecondary ? styles.secondary : styles.primary,
        disabled && styles.disabled,
      ]}
    >
      <Text
        style={[
          styles.text,
          isSecondary ? styles.textSecondary : styles.textPrimary,
        ]}
      >
        {children}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: tokens.borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: tokens.colors.primary,
  },
  secondary: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
  },
  disabled: { opacity: 0.7 },
  text: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textPrimary: { color: '#fff' },
  textSecondary: { color: tokens.colors.textMain },
});
