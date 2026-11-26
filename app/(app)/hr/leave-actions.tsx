import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  useColorScheme, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle, XCircle, Check } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../../lib/supabase';
import { notify } from '../../../lib/notify';

const colors = {
  yellow: '#fbbf24', white: '#ffffff', black: '#000000',
  gray: { 50: '#f8fafc', 200: '#e2e8f0', 400: '#94a3b8', 500: '#64748b', 700: '#334155', 800: '#1e293b', 900: '#0f172a' },
};

type Item = {
  id: string;
  submission_id: string;
  outcome: 'approved' | 'declined';
  form_name: string | null;
  employee_name: string | null;
  created_at: string;
  actioned_at: string | null;
};

export default function LeaveActions() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'todo' | 'done'>('todo');

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    text: isDark ? colors.white : '#1e293b',
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    muted: isDark ? colors.gray[500] : colors.gray[400],
    input: isDark ? colors.gray[800] : colors.gray[50],
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const { data, error } = await supabase
      .from('hr_notifications')
      .select('id, submission_id, outcome, form_name, employee_name, created_at, actioned_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) notify('Error', error.message);
    setItems((data as Item[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }

  async function markDone(item: Item, done: boolean) {
    const when = done ? new Date().toISOString() : null;
    const { error } = await supabase.from('hr_notifications').update({ actioned_at: when }).eq('id', item.id);
    if (error) { notify('Error', error.message); return; }
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, actioned_at: when } : i)));
  }

  const todo = items.filter(i => !i.actioned_at);
  const done = items.filter(i => !!i.actioned_at);
  const list = tab === 'todo' ? todo : done;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color={colors.yellow} size={24} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Leave Actions</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 4 }}>
        {([['todo', `To do (${todo.length})`], ['done', `Done (${done.length})`]] as const).map(([k, label]) => (
          <TouchableOpacity
            key={k}
            onPress={() => setTab(k)}
            style={[styles.tab, { borderColor: tab === k ? colors.yellow : theme.border, backgroundColor: tab === k ? `${colors.yellow}20` : theme.card }]}
          >
            <Text style={{ color: tab === k ? colors.yellow : theme.text, fontWeight: '700', fontSize: 13 }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.yellow} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.yellow} />}
        >
          {list.length === 0 ? (
            <Text style={{ color: theme.muted, textAlign: 'center', marginTop: 40 }}>
              {tab === 'todo' ? 'Nothing waiting for HR action.' : 'No completed items yet.'}
            </Text>
          ) : list.map(item => {
            const ok = item.outcome === 'approved';
            const tint = ok ? '#10b981' : '#ef4444';
            return (
              <View key={item.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  {ok ? <CheckCircle color={tint} size={26} /> : <XCircle color={tint} size={26} />}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{item.employee_name ?? 'Employee'}</Text>
                    <Text style={{ color: theme.subtext, fontSize: 13 }}>{item.form_name ?? 'Leave form'}</Text>
                    <Text style={{ color: theme.muted, fontSize: 11.5, marginTop: 2 }}>
                      Fully {item.outcome} · {new Date(item.created_at).toLocaleString('en-ZA')}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: `${tint}22`, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ color: tint, fontSize: 11, fontWeight: '700' }}>{ok ? 'APPROVED' : 'DECLINED'}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: theme.input, borderColor: theme.border, borderWidth: 1 }]}
                    onPress={() => router.push(`/(app)/hr/requests/${item.submission_id}` as any)}
                  >
                    <Text style={{ color: colors.yellow, fontWeight: '700', fontSize: 13 }}>Open request</Text>
                  </TouchableOpacity>
                  {item.actioned_at ? (
                    <TouchableOpacity style={[styles.btn, { backgroundColor: theme.input, borderColor: theme.border, borderWidth: 1 }]} onPress={() => markDone(item, false)}>
                      <Text style={{ color: theme.text, fontWeight: '600', fontSize: 13 }}>Move back to To do</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={[styles.btn, { backgroundColor: colors.yellow, flexDirection: 'row', gap: 6 }]} onPress={() => markDone(item, true)}>
                      <Check color={colors.black} size={15} />
                      <Text style={{ color: colors.black, fontWeight: '700', fontSize: 13 }}>Mark done</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  tab: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  btn: { flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
