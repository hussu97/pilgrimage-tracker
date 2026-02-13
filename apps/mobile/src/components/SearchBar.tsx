import { View, TextInput, StyleSheet } from 'react-native';
import { tokens } from '../lib/theme';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export default function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search...',
}: SearchBarProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <View style={styles.icon} />
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.colors.textMuted}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.inputBorder,
    paddingBottom: 8,
  },
  iconWrap: { marginRight: 12 },
  icon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: tokens.colors.textMuted,
    opacity: 0.5,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    paddingRight: 8,
    fontSize: 16,
    fontWeight: '300',
    color: tokens.colors.textMain,
  },
});
