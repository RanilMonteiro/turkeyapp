import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator,
  RefreshControl
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Clock } from 'lucide-react-native';
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

type Approval = {
  id: string;
  approval_order: number;
  status: string;
  submission: {
    id: string;
    status: string;
    submitted_at: string;
    employee: { full_name: string } | null;
    template: { name: string } | null;
  } | null;
};

export default function MyApprovals() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [approvals, setApprovals] = useState<Approval[]>([]);
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
      fetchApprovals();
    }, [])
  );

  async function fetchApprovals() {
    const { data: userData } = await supabase.auth.getUser();

    const { data } = await supabase
      .from('form_approvals')
      .select(`
        *,
        submission:submission_id(
          id, status, submitted_at,
          employee:employee_id(full_name),
          template:template_id(name)
        )
      `)
      .eq('approver_id', userData.user?.id)
      .eq('status', 'pending')
      .order('approval_order');

    if (data) setApprovals(data);
    setLoading(false);
    setRefreshing(false);
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
        <Text style={[styles.headerTitle, { color: theme.text }]}>Pending Approvals</Text>
        <Text style={[styles.count, { color: theme.subtext }]}>{approvals.length}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchApprovals(); }}
            tintColor={colors.yellow}
          />
        }
      >
        {approvals.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Clock color={theme.muted} size={40} />
            <Text style={[styles.emptyText, { color: theme.subtext }]}>No pending approvals</Text>
            <Text style={[styles.emptyHint, { color: theme.muted }]}>
              You're all caught up
            </Text>
          </View>
        ) : (
          approvals.map(approval => (
            <TouchableOpacity
              key={approval.id}
              style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => router.push(`/(app)/hr/requests/${approval.submission?.id}` as any)}
              activeOpacity={0.8}
            >
              <View style={styles.cardTop}>
                <Text style={[styles.formName, { color: theme.text }]}>
                  {approval.submission?.template?.name ?? 'Unknown Form'}
                </Text>
                <View style={[styles.orderBadge, { backgroundColor: `${colors.yellow}20` }]}>
                  <Text style={[styles.orderText, { color: colors.yellow }]}>
                    Approver {approval.approval_order}
                  </Text>
                </View>
              </View>
              <Text style={[styles.employeeName, { color: theme.subtext }]}>
                From: {approval.submission?.employee?.full_name}
              </Text>
              <Text style={[styles.submittedAt, { color: theme.muted }]}>
                {approval.submission?.submitted_at
                  ? new Date(approval.submission.submitted_at).toLocaleDateString('en-ZA', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })
                  : ''
                }
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
  count: { fontSize: 15, fontWeight: '600' },
  content: { padding: 16, gap: 10 },
  emptyCard: {
    padding: 48, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', gap: 8, marginTop: 24,
  },
  emptyText: { fontSize: 15, fontWeight: '600' },
  emptyHint: { fontSize: 13, textAlign: 'center' },
  card: { padding: 16, borderRadius: 14, borderWidth: 1 },
  cardTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 6, gap: 8,
  },
  formName: { fontSize: 15, fontWeight: '700', flex: 1 },
  orderBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  orderText: { fontSize: 11, fontWeight: '700' },
  employeeName: { fontSize: 13, marginBottom: 4 },
  submittedAt: { fontSize: 12 },
});