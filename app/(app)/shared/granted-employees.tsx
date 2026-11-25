import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  useColorScheme, ActivityIndicator, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Search, ChevronRight } from 'lucide-react-native';
import Avatar from '../../../components/Avatar';
import RequirePermission from '../../../components/RequirePermission';
import { supabase } from '../../../lib/supabase';

const colors = {
  yellow: '#fbbf24', white: '#ffffff', black: '#000000',
  gray: { 50: '#f8fafc', 200: '#e2e8f0', 400: '#94a3b8', 500: '#64748b', 700: '#334155', 800: '#1e293b', 900: '#0f172a' },
};

type Row = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
  employee_number: string | null;
  info: boolean;
  docs: 'none' | 'all' | number; // number = how many categories
};

function Inner() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    text: isDark ? colors.white : colors.gray[800],
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    muted: isDark ? colors.gray[500] : colors.gray[400],
    input: isDark ? colors.gray[800] : colors.gray[200],
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;

    const [{ data: infoRows }, { data: docRows }] = await Promise.all([
      supabase.from('employee_info_grants').select('employee_id').eq('admin_id', uid),
      supabase.from('document_access_grants').select('employee_id, categories').eq('admin_id', uid),
    ]);

    const ids = Array.from(new Set([
      ...(infoRows ?? []).map((r: any) => r.employee_id),
      ...(docRows ?? []).map((r: any) => r.employee_id),
    ]));

    if (ids.length === 0) { setRows([]); setLoading(false); return; }

    const { data: people } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, job_title, employee_number')
      .in('id', ids)
      .order('full_name');

    const infoSet = new Set((infoRows ?? []).map((r: any) => r.employee_id));
    const docMap = new Map<string, string[] | null>((docRows ?? []).map((r: any) => [r.employee_id, r.categories]));

    setRows(
      (people ?? []).map((p: any) => ({
        ...p,
        info: infoSet.has(p.id),
        docs: !docMap.has(p.id) ? 'none' : docMap.get(p.id) === null ? 'all' : (docMap.get(p.id) as string[]).length,
      }))
    );
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => [r.full_name, r.job_title, r.employee_number].some(v => (v ?? '').toLowerCase().includes(q)));
  }, [rows, search]);

  if (loading) {
    return <View style={[s.center, { backgroundColor: theme.background }]}><ActivityIndicator color={colors.yellow} size="large" /></View>;
  }

  const badge = (text: string, on: boolean) => (
    <View style={[s.badge, { backgroundColor: on ? colors.yellow : theme.input }]}>
      <Text style={{ color: on ? '#111827' : theme.muted, fontSize: 11, fontWeight: '800' }}>{text}</Text>
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><ArrowLeft color={theme.text} size={24} /></TouchableOpacity>
        <View style={{ marginLeft: 14 }}>
          <Text style={[s.title, { color: theme.text }]}>Employees</Text>
          <Text style={[s.subtitle, { color: theme.subtext }]}>Read only · people HR has given you access to</Text>
        </View>
      </View>

      <View style={[s.searchBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Search color={theme.muted} size={18} />
        <TextInput style={[s.searchInput, { color: theme.text }]} placeholder="Search name or employee number..." placeholderTextColor={theme.muted} value={search} onChangeText={setSearch} />
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {filtered.length === 0 ? (
          <View style={[s.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={{ color: theme.subtext, textAlign: 'center' }}>
              {rows.length === 0 ? 'HR has not given you access to any employees yet.' : 'No matches.'}
            </Text>
          </View>
        ) : filtered.map(r => (
          <TouchableOpacity
            key={r.id}
            style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => router.push(`/(app)/shared/granted-employee/${r.id}` as any)}
            activeOpacity={0.8}
          >
            <Avatar fallback="icon" url={r.avatar_url} name={r.full_name ?? ''} size={46} backgroundColor={theme.input} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[s.name, { color: theme.text }]}>{r.full_name ?? 'Unnamed'}</Text>
              <Text style={{ color: theme.subtext, fontSize: 13 }}>
                {r.job_title ?? 'Employee'}{r.employee_number ? ` · #${r.employee_number}` : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                {badge('INFO', r.info)}
                {badge(r.docs === 'none' ? 'DOCS' : r.docs === 'all' ? 'ALL DOCS' : `DOCS (${r.docs} types)`, r.docs !== 'none')}
              </View>
            </View>
            <ChevronRight color={theme.muted} size={20} />
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

export default function GrantedEmployees() {
  return (
    <RequirePermission permission="view_employees" name="Employees">
      <Inner />
    </RequirePermission>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 24, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 16, paddingHorizontal: 14, height: 48, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 15 },
  empty: { padding: 28, borderRadius: 12, borderWidth: 1 },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  name: { fontSize: 16, fontWeight: '700' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
});
