import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, useColorScheme,
  ActivityIndicator, Linking, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Navigation, MapPin } from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';
import { notify } from '../../../../lib/notify';
import DatePickerField from '../../../../components/DatepickerField';
import TimePickerField from '../../../../components/TimePickerField';

const colors = {
  yellow: '#fbbf24',
  white: '#ffffff',
  black: '#000000',
  gray: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    400: '#94a3b8',
    500: '#64748b',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  }
};

function todayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

function nowTimeString(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function NewCallout() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';

  const [title, setTitle] = useState('');
  const [siteName, setSiteName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [loading, setLoading] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');

  const [dateStr, setDateStr] = useState(todayDateString());
  const [timeStr, setTimeStr] = useState(nowTimeString());

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    input: isDark ? colors.gray[800] : colors.gray[100],
    text: isDark ? colors.white : colors.gray[800],
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    label: isDark ? colors.gray[400] : colors.gray[500],
    muted: isDark ? colors.gray[400] : colors.gray[500],
  };

  const formattedDateDisplay = dateStr
    ? new Date(dateStr + 'T00:00:00').toLocaleDateString('en-ZA', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
      })
    : '';

  // dbDate/dbTime are exactly what's stored — dateStr and timeStr are
  // already in the right format ('YYYY-MM-DD' and 'HH:MM'), so no
  // conversion needed at submit time like the old Date-object version.
  const dbDate = dateStr;
  const dbTime = timeStr;

  function parseCoordinates(text: string) {
    const patterns = [
      /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /maps\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        setLatitude(match[1]);
        setLongitude(match[2]);
        return;
      }
    }
  }

  function openInMaps() {
    if (!latitude || !longitude) return;
    const url = Platform.select({
      ios: `maps:${latitude},${longitude}?q=${address}`,
      android: `geo:${latitude},${longitude}?q=${address}`,
    });
    if (url) Linking.openURL(url);
  }

  async function sendPushNotifications(calloutTitle: string) {
    const { data: technicians } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('role', 'technician')
      .not('push_token', 'is', null);

    if (!technicians || technicians.length === 0) return;

    const messages = technicians
      .filter(t => t.push_token)
      .map(t => ({
        to: t.push_token,
        sound: 'default',
        title: '🔧 New Callout Available',
        body: calloutTitle,
        data: { type: 'new_callout' },
      }));

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
  }

  async function handleSubmit() {
    if (!title || !siteName || !address) {
      notify('Missing fields', 'Please fill in title, site name and address.');
      return;
    }

    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from('callouts').insert({
  title,
  site_name: siteName,
  description,
  address,
  latitude: latitude ? parseFloat(latitude) : null,
  longitude: longitude ? parseFloat(longitude) : null,
  date: dbDate,
  time: dbTime,
  status: 'pending',
  created_by: userData.user?.id,
  invoice_number: invoiceNumber.trim() || null,
});

    if (error) {
      notify('Error', error.message);
      setLoading(false);
      return;
    }

    await sendPushNotifications(title);
    setLoading(false);
    notify('Callout created', 'All technicians have been notified.', () => router.back());
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color={colors.yellow} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>New Callout</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>

        {/* Title */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.label }]}>TITLE *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
            placeholder="e.g. Emergency repair at Site A"
            placeholderTextColor={theme.subtext}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        {/* Site Name */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.label }]}>SITE NAME *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
            placeholder="e.g. Shaft 3 - North Mine"
            placeholderTextColor={theme.subtext}
            value={siteName}
            onChangeText={setSiteName}
          />
        </View>

        {/* Description */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.label }]}>DESCRIPTION</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
            placeholder="Describe the job..."
            placeholderTextColor={theme.subtext}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Address */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.label }]}>ADDRESS *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
            placeholder="e.g. 123 Main Street, Johannesburg"
            placeholderTextColor={theme.subtext}
            value={address}
            onChangeText={setAddress}
          />
        </View>

        {/* Invoice Number */}
<View style={styles.fieldGroup}>
  <Text style={[styles.label, { color: theme.label }]}>INVOICE NUMBER (OPTIONAL)</Text>
  <TextInput
    style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
    placeholder="e.g. INV-2026-0142"
    placeholderTextColor={theme.subtext}
    value={invoiceNumber}
    onChangeText={setInvoiceNumber}
  />
</View>

        {/* Location Pin */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.label }]}>LOCATION PIN (OPTIONAL)</Text>
          <Text style={[styles.hint, { color: theme.subtext }]}>
            Paste Google Maps link or coordinates e.g. -26.2041, 28.0473
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
            placeholder="Paste link or coordinates from WhatsApp"
            placeholderTextColor={theme.subtext}
            onChangeText={(text) => parseCoordinates(text)}
          />
          {latitude && longitude && (
            <View style={styles.coordsRow}>
              <MapPin color={colors.yellow} size={14} />
              <Text style={[styles.coordsText, { color: theme.subtext }]}>
                {parseFloat(latitude).toFixed(4)}, {parseFloat(longitude).toFixed(4)}
              </Text>
              <TouchableOpacity style={styles.mapsButton} onPress={openInMaps}>
                <Navigation color={colors.black} size={14} />
                <Text style={styles.mapsButtonText}>Preview</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Date */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.label }]}>DATE *</Text>
          <DatePickerField
            value={dateStr}
            onChange={setDateStr}
            placeholder={formattedDateDisplay}
            isDark={isDark}
            theme={theme}
          />
        </View>

        {/* Time */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.label }]}>TIME *</Text>
          <TimePickerField
            value={timeStr}
            onChange={setTimeStr}
            isDark={isDark}
            theme={theme}
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, loading && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={colors.black} />
            : <Text style={styles.submitText}>Create Callout</Text>
          }
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 48 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  card: {
    margin: 16,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
  },
  fieldGroup: { marginBottom: 20 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    marginBottom: 8,
    lineHeight: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  coordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  coordsText: { flex: 1, fontSize: 12 },
  mapsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.yellow,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  mapsButtonText: {
    color: colors.black,
    fontWeight: '600',
    fontSize: 12,
  },
  submitButton: {
    backgroundColor: colors.yellow,
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitText: {
    color: colors.black,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});