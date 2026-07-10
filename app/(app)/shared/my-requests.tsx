import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator,
  RefreshControl
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, FileText, Clock, CheckCircle, XCircle } from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';

const colors = {
  yellow: '#fbbf24',
  white: '#ffffff',
  black: '#000000',
  gray: {
    50: '#f8fafc',
    200: '#e2e8f0',
    400: '#94a3b8',
    500: '#64748b',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  }
};

type Submission = {
  id: string;
  status: string;
  submitted_at: string;
  template: { name: string; category: string | null } | null;
};

export default function MyRequests() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    text: isDark ? colors.white : '#1e293b',
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    muted: isDark ? colors.gray[500] : colors.gray[400],
  };

  useFocusEffect(
    useCallback(() => {
      fetchSubmissions();
    }, [])
  );

  async function fetchSubmissions() {
    const { data: userData } = await supabase.auth.getUser();
    const { data } = await supabase
      .from('form_submissions')
      .select('*, template:template_id(name, category)')
      .eq('employee_id', userData.user?.id)
      .order('submitted_at', { ascending: false });

    if (data) setSubmissions(data);
    setLoading(false);
    setRefreshing(false);
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'approved': return '#10b981';
      case 'declined': return '#ef4444';
      case 'in_review': return '#3b82f6';
      default: return '#f59e0b';
    }
  }

  function getStatusBg(status: string) {
    if (isDark) {
      switch (status) {
        case 'approved': return '#064e3b';
        case 'declined': return '#3b1a1a';
        case 'in_review': return '#1e3a5f';
        default: return '#78350f';
      }
    } else {
      switch (status) {
        case 'approved': return '#d1fae5';
        case 'declined': return '#fee2e2';
        case 'in_review': return '#dbeafe';
        default: return '#fef3c7';
      }
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'approved': return <CheckCircle color="#10b981" size={14} />;
      case 'declined': return <XCircle color="#ef4444" size={14} />;
      default: return <Clock color="#f59e0b" size={14} />;
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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft color={colors.yellow} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>My Requests</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchSubmissions(); }}
            tintColor={colors.yellow}
          />
        }
      >
        {submissions.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <FileText color={theme.muted} size={40} />
            <Text style={[styles.emptyText, { color: theme.subtext }]}>No requests yet</Text>
            <Text style={[styles.emptyHint, { color: theme.muted }]}>
              Submit a form to see it here
            </Text>
          </View>
        ) : (
          submissions.map(submission => (
            <TouchableOpacity
              key={submission.id}
              style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderLeftColor: getStatusColor(submission.status) }]}
              onPress={() => router.push(`/(app)/hr/requests/${submission.id}` as any)}
              activeOpacity={0.8}
            >
              <View style={styles.cardTop}>
                <Text style={[styles.formName, { color: theme.text }]}>
                  {submission.template?.name ?? 'Unknown Form'}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusBg(submission.status) }]}>
                  <View style={styles.statusInner}>
                    {getStatusIcon(submission.status)}
                    <Text style={[styles.statusText, { color: getStatusColor(submission.status) }]}>
                      {submission.status.replace('_', ' ')}
                    </Text>
                  </View>
                </View>
              </View>
              <Text style={[styles.submittedAt, { color: theme.muted }]}>
                {new Date(submission.submitted_at).toLocaleDateString('en-ZA', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  content: { padding: 16, gap: 10 },
  emptyCard: {
    padding: 48, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', gap: 8, marginTop: 24,
  },
  emptyText: { fontSize: 15, fontWeight: '600' },
  emptyHint: { fontSize: 13, textAlign: 'center' },
  card: {
    padding: 16, borderRadius: 14, borderWidth: 1, borderLeftWidth: 4,
  },
  cardTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 6, gap: 8,
  },
  formName: { fontSize: 15, fontWeight: '700', flex: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { fontSize: 11, fontWeight: '600' },
  submittedAt: { fontSize: 12 },
});