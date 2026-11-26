import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity, TextInput, Switch,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { X, Search } from 'lucide-react-native';
import Avatar from './Avatar';
import { supabase } from '../lib/supabase';
import { notify } from '../lib/notify';

const YELLOW = '#fbbf24';

type Theme = { background: string; card: string; border: string; input: string; text: string; subtext: string; muted: string };
type Person = { id: string; full_name: string | null; avatar_url: string | null; job_title: string | null; role: string };
type Access = { info: boolean; docs: 'none' | 'all' | 'some'; cats: string[] };

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
  adminId: string;
  adminName: string;
  theme: Theme;
  categories: { value: string; label: string }[];
};

const EMPTY: Access = { info: false, docs: 'none', cats: [] };

// Admin-first view: open an admin, see EVERY employee, and choose what that
// admin may see of each one. The "Everyone" switches at the top apply to all
// current AND future employees.
export default function AdminEmployeeAccessModal({ visible, onClose, onSaved, adminId, adminName, theme, categories }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [access, setAccess] = useState<Record<string, Access>>({});
  const [allInfo, setAllInfo] = useState(false);
  const [allDocs, setAllDocs] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!visible) return;
    (async () => {
      setLoading(true);
      setSearch('');
      const [{ data: ppl }, { data: docG }, { data: infoG }, { data: flags }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, avatar_url, job_title, role')
          .in('role', ['technician', 'hr', 'admin']).eq('is_archived', false).neq('id', adminId).order('full_name'),
        supabase.from('document_access_grants').select('employee_id, categories').eq('admin_id', adminId),
        supabase.from('employee_info_grants').select('employee_id').eq('admin_id', adminId),
        supabase.from('admin_access_all').select('info, docs').eq('admin_id', adminId).maybeSingle(),
      ]);
      const map: Record<string, Access> = {};
      (ppl ?? []).forEach((p: any) => { map[p.id] = { ...EMPTY, cats: [] }; });
      (infoG ?? []).forEach((r: any) => { if (map[r.employee_id]) map[r.employee_id].info = true; });
      (docG ?? []).forEach((r: any) => {
        if (!map[r.employee_id]) return;
        map[r.employee_id].docs = r.categories === null ? 'all' : 'some';
        map[r.employee_id].cats = r.categories ?? [];
      });
      const fInfo = !!(flags as any)?.info;
      const fDocs = !!(flags as any)?.docs;
      Object.keys(map).forEach(id => {
        if (fInfo) map[id].info = true;
        if (fDocs) { map[id].docs = 'all'; map[id].cats = []; }
      });
      setPeople((ppl as Person[]) ?? []);
      setAccess(map);
      setAllInfo(fInfo);
      setAllDocs(fDocs);
      setLoading(false);
    })();
  }, [visible, adminId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? people.filter(p => (p.full_name ?? '').toLowerCase().includes(q) || (p.job_title ?? '').toLowerCase().includes(q)) : people;
  }, [people, search]);

  const infoCount = Object.values(access).filter(a => a.info).length;
  const docsCount = Object.values(access).filter(a => a.docs !== 'none').length;

  // "Everyone" is a shortcut: switching it on ticks every employee, and the
  // individual controls stay editable. Changing one person away from the
  // shortcut switches "Everyone" off so nothing is silently ignored.
  function setEveryoneInfo(v: boolean) {
    setAllInfo(v);
    if (v) setAccess(prev => Object.fromEntries(Object.entries(prev).map(([id, a]) => [id, { ...a, info: true }])));
  }
  function setEveryoneDocs(v: boolean) {
    setAllDocs(v);
    if (v) setAccess(prev => Object.fromEntries(Object.entries(prev).map(([id, a]) => [id, { ...a, docs: 'all' as const, cats: [] }])));
  }

  function patch(id: string, p: Partial<Access>) {
    setAccess(prev => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY), ...p } }));
  }
  function toggleCat(id: string, cat: string) {
    const cur = access[id] ?? EMPTY;
    patch(id, { cats: cur.cats.includes(cat) ? cur.cats.filter(c => c !== cat) : [...cur.cats, cat] });
  }

  async function save() {
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const by = u.user?.id;

      await supabase.from('document_access_grants').delete().eq('admin_id', adminId);
      await supabase.from('employee_info_grants').delete().eq('admin_id', adminId);

      const docRows = Object.entries(access)
        .filter(([, a]) => a.docs === 'all' || (a.docs === 'some' && a.cats.length > 0))
        .map(([employee_id, a]) => ({
          admin_id: adminId, employee_id, granted_by: by,
          categories: a.docs === 'all' ? null : a.cats,
        }));
      const infoRows = Object.entries(access)
        .filter(([, a]) => a.info)
        .map(([employee_id]) => ({ admin_id: adminId, employee_id, granted_by: by }));

      if (docRows.length) {
        const { error } = await supabase.from('document_access_grants').insert(docRows);
        if (error) throw error;
      }
      if (infoRows.length) {
        const { error } = await supabase.from('employee_info_grants').insert(infoRows);
        if (error) throw error;
      }
      const { error: fErr } = await supabase.from('admin_access_all').upsert({
        admin_id: adminId, info: allInfo, docs: allDocs, granted_by: by, updated_at: new Date().toISOString(),
      });
      if (fErr) throw fErr;

      notify('Saved', `${adminName}'s employee access has been updated.`);
      onSaved?.();
      onClose();
    } catch (e: any) {
      notify('Error', e?.message ?? 'Could not save.');
    }
    setSaving(false);
  }

  const chip = (label: string, on: boolean, onPress: () => void, disabled?: boolean) => (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={[s.chip, { borderColor: theme.border }, on && { backgroundColor: YELLOW, borderColor: YELLOW }, disabled && { opacity: 0.45 }]}
    >
      <Text style={{ fontSize: 12, fontWeight: '700', color: on ? '#111827' : theme.subtext }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={[s.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={onClose}><X color={theme.muted} size={24} /></TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={[s.title, { color: theme.text }]}>Employee Access</Text>
            <Text style={{ color: theme.subtext, fontSize: 12 }}>{adminName}</Text>
          </View>
          <View style={{ width: 24 }} />
        </View>

        {loading ? (
          <View style={s.center}><ActivityIndicator color={YELLOW} size="large" /></View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
            <Text style={{ color: theme.subtext, fontSize: 13, lineHeight: 19, marginBottom: 14 }}>
              Choose what {adminName} can see of each employee. Personal info is read only. They also need the
              "Employees tab" switch on in Edit User. {infoCount} with info · {docsCount} with documents.
            </Text>

            {/* Everyone */}
            <View style={[s.card, { backgroundColor: theme.card, borderColor: YELLOW }]}>
              <Text style={[s.cardTitle, { color: theme.text }]}>Everyone</Text>
              <Text style={{ color: theme.subtext, fontSize: 12, marginBottom: 6 }}>
                Applies to all employees, including people added later.
              </Text>
              <View style={s.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowTitle, { color: theme.text }]}>All employees - personal info</Text>
                </View>
                <Switch value={allInfo} onValueChange={setEveryoneInfo} trackColor={{ true: YELLOW }} />
              </View>
              <View style={s.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowTitle, { color: theme.text }]}>All employees - all documents</Text>
                </View>
                <Switch value={allDocs} onValueChange={setEveryoneDocs} trackColor={{ true: YELLOW }} />
              </View>
            </View>

            {/* Search */}
            <View style={[s.search, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Search color={theme.muted} size={18} />
              <TextInput
                style={{ flex: 1, color: theme.text, fontSize: 15 }}
                placeholder="Search employees..."
                placeholderTextColor={theme.muted}
                value={search}
                onChangeText={setSearch}
              />
            </View>

            {filtered.map(p => {
              const a = access[p.id] ?? EMPTY;
              const infoOn = a.info;
              const docsMode = a.docs;
              return (
                <View key={p.id} style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Avatar fallback="icon" url={p.avatar_url} name={p.full_name ?? ''} size={36} backgroundColor={theme.input} />
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <Text style={[s.rowTitle, { color: theme.text }]}>{p.full_name}</Text>
                      <Text style={{ color: theme.subtext, fontSize: 12, textTransform: 'capitalize' }}>
                        {p.job_title ?? p.role}
                      </Text>
                    </View>
                  </View>

                  <View style={s.switchRow}>
                    <Text style={{ color: theme.text, fontWeight: '600', flex: 1 }}>Personal info</Text>
                    <Switch
                      value={infoOn}
                      onValueChange={v => { patch(p.id, { info: v }); if (!v) setAllInfo(false); }}
                      trackColor={{ true: YELLOW }}
                    />
                  </View>

                  <Text style={{ color: theme.text, fontWeight: '600', marginTop: 6, marginBottom: 6 }}>Documents</Text>
                  <View style={s.chips}>
                    {chip('None', docsMode === 'none', () => { patch(p.id, { docs: 'none' }); setAllDocs(false); })}
                    {chip('All', docsMode === 'all', () => patch(p.id, { docs: 'all' }))}
                    {chip('Pick types', docsMode === 'some', () => { patch(p.id, { docs: 'some' }); setAllDocs(false); })}
                  </View>
                  {docsMode === 'some' && (
                    <View style={[s.chips, { marginTop: 8 }]}>
                      {categories.map(c => chip(c.label, a.cats.includes(c.value), () => { toggleCat(p.id, c.value); setAllDocs(false); }))}
                    </View>
                  )}
                </View>
              );
            })}

            {filtered.length === 0 && (
              <Text style={{ color: theme.muted, textAlign: 'center', marginTop: 20 }}>No employees found.</Text>
            )}
          </ScrollView>
        )}

        {!loading && (
          <View style={[s.footer, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
            <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#111827" /> : <Text style={{ color: '#111827', fontWeight: '800', fontSize: 16 }}>Save Employee Access</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '800' },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 46, marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, borderTopWidth: 1 },
  saveBtn: { backgroundColor: YELLOW, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
