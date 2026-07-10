import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, RefreshControl,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { Plus, Clock, CheckCircle, User } from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';

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

type Callout = {
  id: string;
  title: string;
  site_name: string;
  address: string;
  date: string;
  time: string;
  status: string;
  assigned_to: string | null;
  description: string | null;
  profiles: { full_name: string } | null;
};

export default function AdminCalloutsDashboard() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [callouts, setCallouts] = useState<Callout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    text: isDark ? colors.white : colors.gray[800],
    subtext: isDark ? colors.gray[400] : colors.gray[500],
  };

  async function fetchCallouts() {
    const { data, error } = await supabase
      .from('callouts')
      .select('*, profiles:assigned_to(full_name)')
      .order('created_at', { ascending: false });

    if (!error && data) setCallouts(data);
    setLoading(false);
    setRefreshing(false);
  }

  useFocusEffect(
    useCallback(() => {
      fetchCallouts();
    }, [])
  );

  const pending = callouts.filter(c => c.status === 'pending');
  const accepted = callouts.filter(c => c.status === 'accepted');
  const completed = callouts.filter(c => c.status === 'completed');

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
        default: return colors.gray[100];
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

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchCallouts(); }}
          tintColor={colors.yellow}
        />
      }
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card }]}>
        <View>
          <Text style={[styles.greeting, { color: theme.subtext }]}>Admin</Text>
          <Text style={[styles.title, { color: isDark ? colors.yellow : colors.gray[800] }]}>
            Callouts
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/(app)/callouts/(admin)/new-callout' as any)}
        >
          <Plus color={colors.black} size={24} />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Clock color="#f59e0b" size={20} />
          <Text style={[styles.statValue, { color: theme.text }]}>{pending.length}</Text>
          <Text style={[styles.statLabel, { color: theme.subtext }]}>Pending</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <User color="#3b82f6" size={20} />
          <Text style={[styles.statValue, { color: theme.text }]}>{accepted.length}</Text>
          <Text style={[styles.statLabel, { color: theme.subtext }]}>Accepted</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <CheckCircle color="#10b981" size={20} />
          <Text style={[styles.statValue, { color: theme.text }]}>{completed.length}</Text>
          <Text style={[styles.statLabel, { color: theme.subtext }]}>Completed</Text>
        </View>
      </View>

      {/* Callouts List */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>All Callouts</Text>

        {callouts.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.emptyText, { color: theme.subtext }]}>No callouts yet</Text>
            <Text style={[styles.emptyHint, { color: theme.subtext }]}>
              Tap + to create your first callout
            </Text>
          </View>
        ) : (
          callouts.map((callout) => (
            <TouchableOpacity
              key={callout.id}
              style={[styles.calloutCard, {
                backgroundColor: theme.card,
                borderColor: theme.border,
                borderLeftColor: getStatusColor(callout.status),
              }]}
              onPress={() => router.push(`/(app)/callouts/(admin)/callout/${callout.id}` as any)}
              activeOpacity={0.8}
            >
              <View style={styles.calloutHeader}>
                <Text style={[styles.calloutTitle, { color: theme.text }]} numberOfLines={1}>
                  {callout.title}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusBg(callout.status) }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(callout.status) }]}>
                    {callout.status}
                  </Text>
                </View>
              </View>

              <Text style={[styles.calloutSite, { color: colors.yellow }]}>
                {callout.site_name}
              </Text>

              <Text style={[styles.calloutDetail, { color: theme.subtext }]}>
                📍 {callout.address}
              </Text>

              <Text style={[styles.calloutDetail, { color: theme.subtext }]}>
                📅 {callout.date} at {callout.time}
              </Text>

              {callout.profiles && (
                <Text style={[styles.calloutDetail, { color: theme.subtext }]}>
                  👤 {callout.profiles.full_name}
                </Text>
              )}
            </TouchableOpacity>
          ))
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingTop: 60,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  greeting: { fontSize: 14 },
  title: { fontSize: 28, fontWeight: 'bold' },
  addButton: {
    backgroundColor: colors.yellow,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  statValue: { fontSize: 24, fontWeight: 'bold' },
  statLabel: { fontSize: 12 },
  section: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  emptyCard: {
    padding: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyText: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptyHint: { fontSize: 14 },
  calloutCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    marginBottom: 12,
  },
  calloutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  calloutTitle: { fontSize: 16, fontWeight: '600', flex: 1, marginRight: 8 },
  calloutSite: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  calloutDetail: { fontSize: 13, marginBottom: 3 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '600' },
});