import React, { useState } from 'react';
import { Text, TouchableOpacity, StyleSheet, ViewStyle, Platform } from 'react-native';
import { Clock } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

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

function timeStringToDate(value: string): Date {
  const d = new Date();
  if (value) {
    const [h, m] = value.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  }
  return d;
}

function dateToTimeString(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function formatDisplay(value: string): string {
  const [h, m] = value.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m);
  return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function TimePickerField({ value, onChange, placeholder, isDark, theme, style }: Props) {
  const [show, setShow] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={[styles.pickerBtn, { backgroundColor: theme.input, borderColor: theme.border }, style]}
        onPress={() => setShow(true)}
      >
        <Clock color="#fbbf24" size={16} />
        <Text style={[styles.pickerBtnText, { color: value ? theme.text : theme.muted }]}>
          {value ? formatDisplay(value) : (placeholder || 'Select time')}
        </Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={timeStringToDate(value)}
          mode="time"
          is24Hour={true}
          display={Platform.OS === 'ios' ? 'spinner' : 'clock'}
          onChange={(_, date) => {
            setShow(false);
            if (date) onChange(dateToTimeString(date));
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