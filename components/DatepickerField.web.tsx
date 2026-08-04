import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Calendar } from 'lucide-react-native';

type Props = {
  value: string; // 'YYYY-MM-DD' or ''
  onChange: (value: string) => void;
  placeholder?: string;
  isDark?: boolean;
  theme: {
    input: string;
    border: string;
    text: string;
    muted: string;
  };
  style?: ViewStyle;
};

// Metro/Expo picks THIS file over DatePickerField.tsx when building for
// web. @react-native-community/datetimepicker is a native-only wrapper
// around iOS/Android's built-in date picker — there's no real web
// implementation, so it silently fails to work there. A plain HTML
// <input type="date"> uses the browser's own native date picker
// instead, which works reliably everywhere.
export default function DatePickerField({ value, onChange, placeholder, isDark, theme, style }: Props) {
  return (
    <View style={[styles.pickerBtn, { backgroundColor: theme.input, borderColor: theme.border }, style]}>
      <Calendar color="#fbbf24" size={16} />
      {/* @ts-ignore - raw DOM input element, valid on react-native-web */}
      <input
        type="date"
        value={value || ''}
        onChange={(e: any) => onChange(e.target.value)}
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontSize: 15,
          color: value ? theme.text : theme.muted,
          fontFamily: 'inherit',
          height: '100%',
          colorScheme: isDark ? 'dark' : 'light',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
  },
});