import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  useColorScheme, ActivityIndicator, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Search, RotateCcw, FolderOpen } from 'lucide-react-native';
import Avatar from '../../../components/Avatar';
import { supabase } from '../../../lib/supabase';
import { notify, confirm } from '../../../lib/notify';

const colors = {
  yellow: '#fbbf24',
  white: '#ffffff',
  black: '#000000',
  gray: { 50: '#f8fafc', 200: '#e2e8f0', 400: '#94a3b8', 500: '#64748b', 700: '#334155', 800: '#1e293b', 900: '#0f172a' },
};

type Archived = {
  id: string;
  full_name: string | null;
  role: string;
  avatar_url: string | null;
  employee_number: string | null;
  job_title: string | null;
  department: string | null;
  archived_at: string | null;
  archive_reason: string | null;
};

function fmt(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function ArchivePage() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [people, setPeople] = useState<Archived[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    text: isDark ? colors.white : colors.gray[800],
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    muted: isDark ? colors.gray[500] : colors.gray[400],
    input: isDark ? colors.gray[800] : colors.gray[200],
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  async function load() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, avatar_url, employee_number, job_title, department, archived_at, archive_reason')
      .eq('is_archived', true)
      .order('archived_at', { ascending: false });
    if (error) notify('Error', error.message);
    setPeople((data as Archived[]) ?? []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      [p.full_name, p.employee_number, p.job_title, p.department, p.role, p.archive_reason]
        .some((v) => (v ?? '').toLowerCase().includes(q))
    );
  }, [people, search]);

  function reactivate(p: Archived) {
    confirm(
      'Reactivate user',
      `Reactivate ${p.full_name ?? 'this user'}? They will be able to sign in again and will reappear in all lists.`,
      async () => {
        setBusyId(p.id);
        const { error } = await supabase.rpc('restore_user', { p_user_id: p.id });
        setBusyId(null);
        if (error) {
          notify('Could not reactivate', error.message);
          return;
        }
        notify('Reactivated', `${p.full_name ?? 'User'} is active again.`);
        load();
      },
      'Reactivate'
    );
  }

  if (loading) {
    return (
      <View style={[s.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={[s.container, { backgroundColor: theme.background }]} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft color={theme.text} size={24} />
        </TouchableOpacity>
        <View style={{ marginLeft: 14 }}>
          <Text style={[s.title, { color: theme.text }]}>Archive</Text>
          <Text style={[s.subtitle, { color: theme.subtext }]}>
            {people.length} deactivated user{people.length !== 1 ? 's' : ''} · records kept permanently
          </Text>
        </View>
      </View>

      <View style={[s.searchBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Search color={theme.muted} size={18} />
        <TextInput
          style={[s.searchInput, { color: theme.text }]}
          placeholder="Search name, employee number, job title..."
          placeholderTextColor={theme.muted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {filtered.length === 0 ? (
          <View style={[s.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={{ color: theme.subtext }}>
              {people.length === 0 ? 'Nobody has been archived yet.' : 'No matches.'}
            </Text>
          </View>
        ) : (
          filtered.map((p) => (
            <View key={p.id} style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <TouchableOpacity
                style={s.cardTop}
                onPress={() => router.push(`/(app)/hr/employees/${p.id}` as any)}
                activeOpacity={0.8}
              >
                <Avatar fallback="icon" url={p.avatar_url} name={p.full_name ?? ''} size={46} backgroundColor={theme.input} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[s.name, { color: theme.text }]}>{p.full_name ?? 'Unnamed'}</Text>
                  <Text style={{ color: theme.subtext, fontSize: 13, textTransform: 'capitalize' }}>
                    {p.role}{p.job_title ? ` · ${p.job_title}` : ''}{p.employee_number ? ` · #${p.employee_number}` : ''}
                  </Text>
                  <Text style={{ color: '#f59e0b', fontSize: 12, fontWeight: '700', marginTop: 4 }}>
                    Archived {fmt(p.archived_at)}
                  </Text>
                  {p.archive_reason ? (
                    <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 2 }}>{p.archive_reason}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>

              <View style={s.actions}>
                <TouchableOpacity
                  style={[s.btn, { backgroundColor: colors.yellow }]}
                  onPress={() => router.push(`/(app)/hr/employees/${p.id}` as any)}
                >
                  <FolderOpen color="#111827" size={16} />
                  <Text style={s.btnText}>View info &amp; documents</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.btn, { backgroundColor: theme.input, opacity: busyId === p.id ? 0.5 : 1 }]}
                  onPress={() => reactivate(p)}
                  disabled={busyId === p.id}
                >
                  <RotateCcw color={colors.yellow} size={16} />
                  <Text style={[s.btnText, { color: theme.text }]}>Reactivate</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 24, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 16, paddingHorizontal: 14, height: 48, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 15 },
  empty: { padding: 28, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: 10 },
  btnText: { color: '#111827', fontWeight: '700', fontSize: 13 },
});
