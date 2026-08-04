import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle, Platform } from 'react-native';
import { Calendar } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

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

export default function DatePickerField({ value, onChange, placeholder, isDark, theme, style }: Props) {
  const [show, setShow] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={[styles.pickerBtn, { backgroundColor: theme.input, borderColor: theme.border }, style]}
        onPress={() => setShow(true)}
      >
        <Calendar color="#fbbf24" size={16} />
        <Text style={[styles.pickerBtnText, { color: value ? theme.text : theme.muted }]}>
          {value || placeholder || 'Select date'}
        </Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={value ? new Date(value) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
          onChange={(_, date) => {
            setShow(false);
            if (date) onChange(date.toISOString().split('T')[0]);
          }}
          themeVariant={isDark ? 'dark' : 'light'}
        />
      )}
    </>
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
  pickerBtnText: { flex: 1, fontSize: 15 },
});