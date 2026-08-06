import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Clock } from 'lucide-react-native';

type Props = {
  value: string; // 'HH:MM' 24hr, or ''
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

// Same reasoning as DatePickerField.web.tsx — @react-native-community/
// datetimepicker is native-only, so on web we use the browser's own
// <input type="time"> instead, which works reliably everywhere.
export default function TimePickerField({ value, onChange, isDark, theme, style }: Props) {
  return (
    <View style={[styles.pickerBtn, { backgroundColor: theme.input, borderColor: theme.border }, style]}>
      <Clock color="#fbbf24" size={16} />
      {/* @ts-ignore - raw DOM input element, valid on react-native-web */}
      <input
        type="time"
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