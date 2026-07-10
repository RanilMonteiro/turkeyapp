import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator,
  Linking, Platform, Alert, Image
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, MapPin, Navigation, Clock, User, Wrench } from 'lucide-react-native';
import { supabase } from '../../../../../lib/supabase';

const colors = {
  yellow: '#fbbf24',
  white: '#ffffff',
  black: '#000000',
  gray: {
    200: '#e2e8f0',
    400: '#94a3b8',
    500: '#64748b',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  }
};

type Callout = {
  id: string;
  title: string;
  site_name: string;
  description: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  date: string;
  time: string;
  status: string;
  assigned_to: string | null;
  profiles: { full_name: string } | null;
  time_in: string | null;
  time_out: string | null;
  machines_tested: number | null;
  signature_url: string | null;
};

export default function CalloutDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [callout, setCallout] = useState<Callout | null>(null);
  const [loading, setLoading] = useState(true);

  const theme = {
    background: isDark ? colors.black : '#f8fafc',
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    text: isDark ? colors.white : '#1e293b',
    subtext: isDark ? colors.gray[400] : colors.gray[500],
  };

  useEffect(() => {
    fetchCallout();
  }, [id]);

  async function fetchCallout() {
    const { data } = await supabase
      .from('callouts')
      .select('*, profiles:assigned_to(full_name)')
      .eq('id', id)
      .single();

    if (data) setCallout(data);
    setLoading(false);
  }

  async function deleteCallout() {
    Alert.alert(
      'Delete Callout',
      'Are you sure you want to delete this callout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('callouts').delete().eq('id', id);
            router.back();
          }
        }
      ]
    );
  }

  function openInMaps() {
    if (!callout?.latitude || !callout?.longitude) return;
    const url = Platform.select({
      ios: `maps:${callout.latitude},${callout.longitude}?q=${callout.address}`,
      android: `geo:${callout.latitude},${callout.longitude}?q=${callout.address}`,
    });
    if (url) Linking.openURL(url);
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'pending': return '#f59e0b';
      case 'accepted': return '#3b82f6';
      case 'completed': return '#10b981';
      default: return colors.gray[400];
    }
  }

  function getStatusBg(status: string) {
    if (isDark) {
      switch (status) {
        case 'pending': return '#78350f';
        case 'accepted': return '#1e3a5f';
        case 'completed': return '#064e3b';
        default: return colors.gray[800];
      }
    } else {
      switch (status) {
        case 'pending': return '#fef3c7';
        case 'accepted': return '#dbeafe';
        case 'completed': return '#d1fae5';
        default: return colors.gray[200];
      }
    }
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }

  if (!callout) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.subtext }}>Callout not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft color={colors.yellow} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Callout Details</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>

        {/* Title + Status */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
              {callout.title}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusBg(callout.status) }]}>
              <Text style={[styles.statusText, { color: getStatusColor(callout.status) }]}>
                {callout.status}
              </Text>
            </View>
          </View>
          <Text style={[styles.siteName, { color: colors.yellow }]}>
            {callout.site_name}
          </Text>
          {callout.description && (
            <Text style={[styles.description, { color: theme.subtext }]}>
              {callout.description}
            </Text>
          )}
        </View>

        {/* Job Details */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Details</Text>

          <View style={styles.detailRow}>
            <Clock color={colors.yellow} size={16} />
            <Text style={[styles.detailText, { color: theme.subtext }]}>
              {callout.date} at {callout.time}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <MapPin color={colors.yellow} size={16} />
            <Text style={[styles.detailText, { color: theme.subtext }]}>
              {callout.address}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <User color={colors.yellow} size={16} />
            <Text style={[styles.detailText, { color: theme.subtext }]}>
              {callout.profiles?.full_name ?? 'Unassigned'}
            </Text>
          </View>

          {callout.latitude && callout.longitude && (
            <TouchableOpacity style={styles.mapsButton} onPress={openInMaps}>
              <Navigation color={colors.black} size={16} />
              <Text style={styles.mapsButtonText}>Open in Maps</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Completion Details */}
        {callout.status === 'completed' && (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Completion Details</Text>

            {callout.time_in && (
              <View style={styles.detailRow}>
                <Clock color={colors.yellow} size={16} />
                <Text style={[styles.detailText, { color: theme.subtext }]}>
                  Time in: {callout.time_in}
                </Text>
              </View>
            )}

            {callout.time_out && (
              <View style={styles.detailRow}>
                <Clock color={colors.yellow} size={16} />
                <Text style={[styles.detailText, { color: theme.subtext }]}>
                  Time out: {callout.time_out}
                </Text>
              </View>
            )}

            {callout.machines_tested && (
              <View style={styles.detailRow}>
                <Wrench color={colors.yellow} size={16} />
                <Text style={[styles.detailText, { color: theme.subtext }]}>
                  Machines tested: {callout.machines_tested}
                </Text>
              </View>
            )}

            {callout.signature_url && (
              <View style={styles.signatureSection}>
                <Text style={[styles.signatureLabel, { color: theme.subtext }]}>
                  Technician Signature
                </Text>
                <Image
                  source={{ uri: callout.signature_url }}
                  style={[styles.signatureImage, { borderColor: theme.border }]}
                  resizeMode="contain"
                />
              </View>
            )}
          </View>
        )}

        {/* Delete — only if pending */}
        {callout.status === 'pending' && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={deleteCallout}
            activeOpacity={0.85}
          >
            <Text style={styles.deleteButtonText}>Delete Callout</Text>
          </TouchableOpacity>
        )}

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  content: { padding: 16, gap: 16 },
  card: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: '700', flex: 1 },
  siteName: { fontSize: 15, fontWeight: '600', marginBottom: 12 },
  description: { fontSize: 14, lineHeight: 22, marginTop: 4 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  detailText: { fontSize: 14, flex: 1 },
  mapsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.yellow,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 8,
    alignSelf: 'flex-start',
    gap: 8,
  },
  mapsButtonText: { color: colors.black, fontWeight: '600', fontSize: 14 },
  signatureSection: { marginTop: 12 },
  signatureLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  signatureImage: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: colors.white,
  },
  deleteButton: {
    backgroundColor: '#ef4444',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});