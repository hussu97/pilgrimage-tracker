import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';

interface FAQ {
  question: string;
  answer: string;
}

interface PlaceFAQProps {
  faqs?: FAQ[];
}

export default function PlaceFAQ({ faqs }: PlaceFAQProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const { isDark } = useTheme();
  const s = makeStyles(isDark);

  if (!faqs || faqs.length === 0) return null;

  return (
    <View style={s.container}>
      <Text style={s.heading}>Frequently Asked Questions</Text>
      {faqs.map((faq, i) => (
        <TouchableOpacity
          key={i}
          style={s.item}
          onPress={() => setOpenIndex(openIndex === i ? null : i)}
          activeOpacity={0.7}
        >
          <View style={s.questionRow}>
            <Text style={s.question}>{faq.question}</Text>
            <MaterialIcons
              name={openIndex === i ? 'expand-less' : 'expand-more'}
              size={20}
              color={isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary}
            />
          </View>
          {openIndex === i && <Text style={s.answer}>{faq.answer}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}

function makeStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      marginTop: 16,
      paddingHorizontal: 16,
    },
    heading: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#fff' : tokens.colors.textMain,
      marginBottom: 10,
    },
    item: {
      borderWidth: 1,
      borderColor: isDark ? tokens.colors.darkBorder : '#e5e7eb',
      borderRadius: tokens.borderRadius.xl,
      backgroundColor: isDark ? tokens.colors.darkSurface : '#fff',
      padding: 14,
      marginBottom: 8,
    },
    questionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 8,
    },
    question: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#fff' : tokens.colors.textMain,
    },
    answer: {
      fontSize: 12,
      color: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary,
      marginTop: 8,
      lineHeight: 18,
    },
  });
}
