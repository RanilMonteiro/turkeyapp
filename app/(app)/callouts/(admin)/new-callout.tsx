import { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, useColorScheme,
  ActivityIndicator, Linking, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Navigation, MapPin, CheckCircle, AlertCircle } from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';
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

// Local date (toISOString() is UTC, which gives "yesterday" in SA between 00:00 and 02:00)
function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowTimeString(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

type Status = { type: 'success' | 'error'; message: string } | null;

export default function NewCallout() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';

  const [title, setTitle] = useState('');
  const [siteName, setSiteName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [pinText, setPinText] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [loading, setLoading] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [status, setStatus] = useState<Status>(null);

  const [dateStr, setDateStr] = useState(todayDateString());
  const [timeStr, setTimeStr] = useState(nowTimeString());

  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (redirectTimer.current) clearTimeout(redirectTimer.current); }, []);

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

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.input, borderColor: theme.border, color: theme.text },
  ];

  function Label({ text, required }: { text: string; required?: boolean }) {
    return (
      <Text style={[styles.label, { color: theme.label }]}>
        {text}
        {required ? ' *' : ''}
      </Text>
    );
  }

  function handlePinChange(text: string) {
    setPinText(text);
    const patterns = [
      /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /maps\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /^\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\s*$/,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        setLatitude(match[1]);
        setLongitude(match[2]);
        return;
      }
    }
    setLatitude('');
    setLongitude('');
  }

  function openInMaps() {
    if (!latitude || !longitude) return;
    const url = Platform.select({
      ios: `maps:${latitude},${longitude}?q=${address}`,
      android: `geo:${latitude},${longitude}?q=${address}`,
      default: `https://www.google.com/maps?q=${latitude},${longitude}`,
    });
    if (url) Linking.openURL(url);
  }

  function resetForm() {
    setTitle('');
    setSiteName('');
    setDescription('');
    setAddress('');
    setPinText('');
    setLatitude('');
    setLongitude('');
    setInvoiceNumber('');
    setDateStr(todayDateString());
    setTimeStr(nowTimeString());
  }

  async function handleSubmit() {
    if (loading) return;
    setStatus(null);

    if (!title.trim() || !siteName.trim() || !address.trim()) {
      setStatus({ type: 'error', message: 'Please fill in title, site name and address.' });
      return;
    }

    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();

      const { error } = await supabase.from('callouts').insert({
        title: title.trim(),
        site_name: siteName.trim(),
        description: description.trim() || null,
        address: address.trim(),
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        date: dateStr,
        time: timeStr,
        status: 'pending',
        created_by: userData.user?.id,
        invoice_number: invoiceNumber.trim() || null,
      });

      if (error) {
        setStatus({ type: 'error', message: error.message });
        return;
      }

      // Technicians are notified by the database webhook / edge function on insert.
      setStatus({ type: 'success', message: 'Callout created. Technicians will be notified.' });
      resetForm();
      redirectTimer.current = setTimeout(() => {
        router.replace('/(app)/callouts/(admin)/dashboard' as any);
      }, 1500);
    } catch (e: any) {
      setStatus({ type: 'error', message: e?.message ?? 'Something went wrong. Please try again.' });
    } finally {
      setLoading(false);
    }
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
        <View style={{ width: 32 }} />
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>

        <View style={styles.fieldGroup}>
          <Label text="TITLE" required />
          <TextInput
            style={inputStyle}
            placeholder="e.g. Emergency repair at Site A"
            placeholderTextColor={theme.subtext}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Label text="SITE NAME" required />
          <TextInput
            style={inputStyle}
            placeholder="e.g. Shaft 3 - North Mine"
            placeholderTextColor={theme.subtext}
            value={siteName}
            onChangeText={setSiteName}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Label text="ADDRESS" required />
          <TextInput
            style={inputStyle}
            placeholder="e.g. 123 Main Street, Johannesburg"
            placeholderTextColor={theme.subtext}
            value={address}
            onChangeText={setAddress}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Label text="DESCRIPTION" />
          <TextInput
            style={[...inputStyle, styles.textArea]}
            placeholder="Describe the job..."
            placeholderTextColor={theme.subtext}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Label text="INVOICE NUMBER" />
          <TextInput
            style={inputStyle}
            placeholder="e.g. INV-2026-0142"
            placeholderTextColor={theme.subtext}
            value={invoiceNumber}
            onChangeText={setInvoiceNumber}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Label text="LOCATION PIN" />
          <TextInput
            style={inputStyle}
            placeholder="Paste Google Maps link or coordinates"
            placeholderTextColor={theme.subtext}
            value={pinText}
            onChangeText={handlePinChange}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={[styles.hint, { color: theme.subtext }]}>
            e.g. -26.2041, 28.0473
          </Text>
          {latitude && longitude ? (
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
          ) : null}
        </View>

        {/* Date + Time side by side */}
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Label text="DATE" required />
            <DatePickerField
              value={dateStr}
              onChange={setDateStr}
              placeholder={formattedDateDisplay}
              isDark={isDark}
              theme={theme}
            />
          </View>
          <View style={styles.rowItem}>
            <Label text="TIME" required />
            <TimePickerField
              value={timeStr}
              onChange={setTimeStr}
              isDark={isDark}
              theme={theme}
            />
          </View>
        </View>

        {/* Inline confirmation / error (Alert.alert does nothing on web) */}
        {status && (
          <View
            style={[
              styles.banner,
              status.type === 'success'
                ? { backgroundColor: isDark ? '#064e3b' : '#d1fae5', borderColor: '#10b981' }
                : { backgroundColor: isDark ? '#7f1d1d' : '#fee2e2', borderColor: '#ef4444' },
            ]}
          >
            {status.type === 'success'
              ? <CheckCircle color="#10b981" size={18} />
              : <AlertCircle color="#ef4444" size={18} />}
            <Text style={[styles.bannerText, { color: theme.text }]}>{status.message}</Text>
          </View>
        )}

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
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  backBtn: { padding: 4, width: 32 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  card: {
    margin: 16,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  fieldGroup: { marginBottom: 20 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  rowItem: { flex: 1 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    marginTop: 6,
    lineHeight: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  bannerText: { flex: 1, fontSize: 14, lineHeight: 20 },
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
