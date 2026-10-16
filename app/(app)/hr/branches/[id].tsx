import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  useColorScheme, ActivityIndicator, TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft, Building2, User, Search, ChevronRight } from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';
import { notify } from '../../../../lib/notify';

const colors = {
  yellow: '#fbbf24',
  white: '#ffffff',
  black: '#000000',
  gray: { 50: '#f8fafc', 200: '#e2e8f0', 400: '#94a3b8', 500: '#64748b', 700: '#334155', 800: '#1e293b', 900: '#0f172a' },
};

type Member = {
  id: string;
  full_name: string;
  role: string;
  job_title: string | null;
  employee_number: string | null;
};

export default function BranchDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const isDark = useColorScheme() === 'dark';

  const [branchName, setBranchName] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    input: isDark ? colors.gray[800] : colors.gray[50],
    text: isDark ? colors.white : '#1e293b',
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    muted: isDark ? colors.gray[500] : colors.gray[400],
    avatarBg: isDark ? colors.gray[800] : colors.gray[200],
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [id])
  );

  async function load() {
    const [{ data: branch, error: branchError }, { data: people, error: peopleError }] = await Promise.all([
      supabase.from('branches').select('name').eq('id', id).single(),
      supabase
        .from('profiles')
        .select('id, full_name, role, job_title, employee_number')
        .eq('branch_id', id)
        .order('full_name', { ascending: true }),
    ]);

    if (branchError || peopleError) {
      notify('Error', (branchError ?? peopleError)!.message);
    }
    if (branch) setBranchName(branch.name);
    if (people) setMembers(people);
    setLoading(false);
  }

  function roleBadge(role: string) {
    switch (role) {
      case 'admin': return { bg: isDark ? '#1e3a5f' : '#dbeafe', text: '#3b82f6' };
      case 'hr': return { bg: isDark ? '#3b1f5f' : '#ede9fe', text: '#8b5cf6' };
      case 'superuser': return { bg: isDark ? '#78350f' : '#fef3c7', text: '#f59e0b' };
      default: return { bg: isDark ? '#1a2e1a' : '#d1fae5', text: '#10b981' };
    }
  }

  const q = search.trim().toLowerCase();
  const filtered = members.filter(
    m =>
      !q ||
      m.full_name?.toLowerCase().includes(q) ||
      m.job_title?.toLowerCase().includes(q) ||
      m.employee_number?.toLowerCase().includes(q)
  );

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
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {branchName || 'Branch'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.summaryIcon, { backgroundColor: `${colors.yellow}20` }]}>
            <Building2 color={colors.yellow} size={24} />
          </View>
          <Text style={[styles.summaryName, { color: theme.text }]}>{branchName}</Text>
          <Text style={[styles.summaryCount, { color: theme.subtext }]}>
            {members.length} {members.length === 1 ? 'person' : 'people'}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.searchRow, { backgroundColor: theme.input, borderColor: theme.border }]}>
            <Search color={theme.muted} size={16} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search by name, title or employee number..."
              placeholderTextColor={theme.muted}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {members.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.muted }]}>
              Nobody is in this branch yet. Assign people from their employee profile.
            </Text>
          ) : filtered.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.muted }]}>No one matches your search.</Text>
          ) : (
            filtered.map((m, i) => {
              const badge = roleBadge(m.role);
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.memberRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}
                  onPress={() => router.push(`/(app)/hr/employees/${m.id}` as any)}
                >
                  <View style={[styles.avatar, { backgroundColor: theme.avatarBg }]}>
                    <User color={colors.yellow} size={18} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.memberName, { color: theme.text }]} numberOfLines={1}>
                      {m.full_name}
                    </Text>
                    <Text style={[styles.memberSub, { color: theme.subtext }]} numberOfLines={1}>
                      {m.job_title ?? 'No job title'}
                      {m.employee_number ? `  •  ${m.employee_number}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.roleBadge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.roleText, { color: badge.text }]}>
                      {m.role.charAt(0).toUpperCase() + m.role.slice(1)}
                    </Text>
                  </View>
                  <ChevronRight color={theme.muted} size={16} />
                </TouchableOpacity>
              );
            })
          )}
        </View>
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
  headerTitle: { fontSize: 20, fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: 12 },
  content: { padding: 16, gap: 16 },
  summaryCard: { alignItems: 'center', padding: 24, borderRadius: 16, borderWidth: 1, gap: 6 },
  summaryIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  summaryName: { fontSize: 20, fontWeight: '700' },
  summaryCount: { fontSize: 13 },
  card: { borderRadius: 16, padding: 16, borderWidth: 1 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1,
    borderRadius: 12, paddingHorizontal: 12, height: 44, marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },
  emptyText: { fontSize: 13, paddingVertical: 16, textAlign: 'center', lineHeight: 19 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  memberName: { fontSize: 15, fontWeight: '600' },
  memberSub: { fontSize: 12, marginTop: 2 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  roleText: { fontSize: 11, fontWeight: '600' },
});