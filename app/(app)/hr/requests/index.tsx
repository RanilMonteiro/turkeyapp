import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator,
  RefreshControl
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, FileText, Clock, CheckCircle, XCircle } from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';
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
  form_data: any;
  employee: { full_name: string } | null;
  template: { name: string; category: string | null } | null;
};

export default function HRRequests() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'declined'>('all');

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
    const { data } = await supabase
      .from('form_submissions')
      .select(`
        *,
        employee:employee_id(full_name),
        template:template_id(name, category)
      `)
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

  const filtered = filter === 'all'
    ? submissions
    : submissions.filter(s => s.status === filter);

  const counts = {
    all: submissions.length,
    pending: submissions.filter(s => s.status === 'pending').length,
    in_review: submissions.filter(s => s.status === 'in_review').length,
    approved: submissions.filter(s => s.status === 'approved').length,
    declined: submissions.filter(s => s.status === 'declined').length,
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft color={colors.yellow} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>All Requests</Text>
        <Text style={[styles.headerCount, { color: theme.subtext }]}>{submissions.length}</Text>
      </View>

      {/* Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterScroll, { borderBottomColor: theme.border }]}
        contentContainerStyle={styles.filterContent}
      >
        {(['all', 'pending', 'approved', 'declined'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[
              styles.filterTab,
              filter === f && { borderBottomColor: colors.yellow, borderBottomWidth: 2 }
            ]}
            onPress={() => setFilter(f)}
          >
            <Text style={[
              styles.filterText,
              { color: filter === f ? colors.yellow : theme.subtext }
            ]}>
              {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f as keyof typeof counts] ?? 0})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

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
        {filtered.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <FileText color={theme.muted} size={40} />
            <Text style={[styles.emptyText, { color: theme.subtext }]}>No requests</Text>
          </View>
        ) : (
          filtered.map(submission => (
            <TouchableOpacity
              key={submission.id}
              style={[styles.submissionCard, { backgroundColor: theme.card, borderColor: theme.border, borderLeftColor: getStatusColor(submission.status) }]}
              onPress={() => router.push(`/(app)/hr/requests/${submission.id}` as any)}
              activeOpacity={0.8}
            >
              <View style={styles.submissionTop}>
                <View style={styles.submissionInfo}>
                  <Text style={[styles.formName, { color: theme.text }]}>
                    {submission.template?.name ?? 'Unknown Form'}
                  </Text>
                  <Text style={[styles.employeeName, { color: theme.subtext }]}>
                    {submission.employee?.full_name ?? 'Unknown'}
                  </Text>
                </View>
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
                  hour: '2-digit', minute: '2-digit'
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  headerCount: { fontSize: 15, fontWeight: '600' },
  filterScroll: { borderBottomWidth: 1 },
  filterContent: { paddingHorizontal: 16, gap: 4 },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterText: { fontSize: 14, fontWeight: '600' },
  content: { padding: 16, gap: 10 },
  emptyCard: {
    padding: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
  },
  emptyText: { fontSize: 15, fontWeight: '600' },
  submissionCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  submissionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  submissionInfo: { flex: 1, marginRight: 8 },
  formName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  employeeName: { fontSize: 13 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { fontSize: 11, fontWeight: '600' },
  submittedAt: { fontSize: 12 },
});