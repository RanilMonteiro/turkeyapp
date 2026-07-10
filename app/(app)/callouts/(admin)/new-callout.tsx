import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, useColorScheme,
  Alert, ActivityIndicator, Linking, Platform,
  Modal
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Navigation, Calendar, Clock, MapPin } from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';
import DateTimePicker from '@react-native-community/datetimepicker';

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

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    input: isDark ? colors.gray[800] : colors.gray[100],
    text: isDark ? colors.white : colors.gray[800],
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    label: isDark ? colors.gray[400] : colors.gray[500],
  };

  const formattedDate = selectedDate.toLocaleDateString('en-ZA', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });

  const formattedTime = selectedTime.toLocaleTimeString('en-ZA', {
    hour: '2-digit', minute: '2-digit', hour12: false
  });

  const dbDate = selectedDate.toISOString().split('T')[0];
  const dbTime = formattedTime;

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
      Alert.alert('Missing fields', 'Please fill in title, site name and address.');
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
    });

    if (error) {
      Alert.alert('Error', error.message);
      setLoading(false);
      return;
    }

    await sendPushNotifications(title);
    setLoading(false);
    Alert.alert('Callout created', 'All technicians have been notified.', [
      { text: 'OK', onPress: () => router.back() }
    ]);
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
          <TouchableOpacity
            style={[styles.inputRow, { backgroundColor: theme.input, borderColor: theme.border }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Calendar size={16} color={colors.yellow} />
            <Text style={[styles.pickerText, { color: theme.text }]}>{formattedDate}</Text>
          </TouchableOpacity>
        </View>

        {/* Time */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.label }]}>TIME *</Text>
          <TouchableOpacity
            style={[styles.inputRow, { backgroundColor: theme.input, borderColor: theme.border }]}
            onPress={() => setShowTimePicker(true)}
          >
            <Clock size={16} color={colors.yellow} />
            <Text style={[styles.pickerText, { color: theme.text }]}>{formattedTime}</Text>
          </TouchableOpacity>
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

      {/* Date Picker */}
      {showDatePicker && (
        Platform.OS === 'ios' ? (
          <Modal transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={[styles.pickerModal, { backgroundColor: theme.card }]}>
                <View style={styles.pickerHeader}>
                  <Text style={[styles.pickerTitle, { color: theme.text }]}>Select Date</Text>
                  <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                    <Text style={{ color: colors.yellow, fontWeight: '600' }}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display="spinner"
                  minimumDate={new Date()}
                  onChange={(_, date) => { if (date) setSelectedDate(date); }}
                  themeVariant={isDark ? 'dark' : 'light'}
                  style={{ width: '100%' }}
                />
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="calendar"
            minimumDate={new Date()}
            onChange={(_, date) => {
              setShowDatePicker(false);
              if (date) setSelectedDate(date);
            }}
          />
        )
      )}

      {/* Time Picker */}
      {showTimePicker && (
        Platform.OS === 'ios' ? (
          <Modal transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={[styles.pickerModal, { backgroundColor: theme.card }]}>
                <View style={styles.pickerHeader}>
                  <Text style={[styles.pickerTitle, { color: theme.text }]}>Select Time</Text>
                  <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                    <Text style={{ color: colors.yellow, fontWeight: '600' }}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={selectedTime}
                  mode="time"
                  display="spinner"
                  is24Hour={true}
                  onChange={(_, time) => { if (time) setSelectedTime(time); }}
                  themeVariant={isDark ? 'dark' : 'light'}
                  style={{ width: '100%' }}
                />
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={selectedTime}
            mode="time"
            display="clock"
            is24Hour={true}
            onChange={(_, time) => {
              setShowTimePicker(false);
              if (time) setSelectedTime(time);
            }}
          />
        )
      )}
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
  },
  pickerText: { flex: 1, fontSize: 15 },
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  pickerModal: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pickerTitle: { fontSize: 16, fontWeight: '600' },
});