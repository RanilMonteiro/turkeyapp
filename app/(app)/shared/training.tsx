import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput,
  useColorScheme, ActivityIndicator, RefreshControl, Modal, Platform, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Plus, X, Search, ChevronDown, Upload, FileText, Trash2, GraduationCap } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../../lib/supabase';
import { notify, confirm } from '../../../lib/notify';
import { useAccess } from '../../../context/AccessContext';
import DatePickerField from '../../../components/DatepickerField';

const colors = {
  yellow: '#fbbf24', white: '#ffffff', black: '#000000',
  gray: { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 400: '#94a3b8', 500: '#64748b', 700: '#334155', 800: '#1e293b', 900: '#0f172a' },
};

type Branch = { id: string; name: string };
type Emp = { id: string; full_name: string | null; branch_id: string | null };
type TType = { id: string; branch_id: string; name: string; expiry_days: number | null; sort_order: number };
type TDoc = {
  id: string; name: string; description: string | null; file_url: string;
  document_date: string | null; expiry_date: string | null;
  employee_id: string | null; training_type_id: string | null;
};

const pad = (n: number) => String(n).padStart(2, '0');
const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => toStr(new Date());

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toStr(d);
}

function daysLeft(expiry: string | null): number | null {
  if (!expiry) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(expiry + 'T00:00:00').getTime() - t.getTime()) / 86400000);
}

async function fileToUint8Array(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    return new Uint8Array(await blob.arrayBuffer());
  }
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

export default function Training() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const { can } = useAccess();
  const allowed = can('manage_training');

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    input: isDark ? colors.gray[800] : colors.gray[100],
    text: isDark ? colors.white : '#1e293b',
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    muted: isDark ? colors.gray[500] : colors.gray[400],
  };

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [docs, setDocs] = useState<TDoc[]>([]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [types, setTypes] = useState<TType[]>([]);

  // list filters
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'soon' | 'expired'>('all');

  // add form
  const [showAdd, setShowAdd] = useState(false);
  const [description, setDescription] = useState('');
  const [branchId, setBranchId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [docDate, setDocDate] = useState(today());
  const [expiryDate, setExpiryDate] = useState('');
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [saving, setSaving] = useState(false);
  const [openDd, setOpenDd] = useState<'branch' | 'employee' | 'type' | null>(null);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const [d, e, b, t] = await Promise.all([
      supabase.from('documents')
        .select('id, name, description, file_url, document_date, expiry_date, employee_id, training_type_id')
        .eq('category', 'training')
        .order('expiry_date', { ascending: true, nullsFirst: false }),
      supabase.from('profiles').select('id, full_name, branch_id').neq('role', 'superuser').eq('is_archived', false).order('full_name'),
      supabase.from('branches').select('id, name').order('name'),
      supabase.from('training_types').select('id, branch_id, name, expiry_days, sort_order').order('sort_order'),
    ]);
    if (d.error) notify('Error', d.error.message);
    setDocs((d.data as TDoc[]) ?? []);
    setEmps((e.data as Emp[]) ?? []);
    setBranches((b.data as Branch[]) ?? []);
    setTypes((t.data as TType[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }

  const empById = useMemo(() => Object.fromEntries(emps.map(e => [e.id, e])), [emps]);
  const branchById = useMemo(() => Object.fromEntries(branches.map(b => [b.id, b])), [branches]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs
      .map(d => {
        const emp = d.employee_id ? empById[d.employee_id] : undefined;
        return { d, emp, branch: emp?.branch_id ? branchById[emp.branch_id] : undefined, left: daysLeft(d.expiry_date) };
      })
      .filter(r => {
        if (branchFilter && r.emp?.branch_id !== branchFilter) return false;
        if (statusFilter === 'expired' && !(r.left !== null && r.left < 0)) return false;
        if (statusFilter === 'soon' && !(r.left !== null && r.left >= 0 && r.left <= 60)) return false;
        if (q && !`${r.emp?.full_name ?? ''} ${r.d.name} ${r.d.description ?? ''}`.toLowerCase().includes(q)) return false;
        return true;
      })
      // expired first, then soonest to expire, then no-expiry last
      .sort((a, b) => (a.left ?? 99999) - (b.left ?? 99999));
  }, [docs, empById, branchById, search, branchFilter, statusFilter]);

  // ---- add form helpers ----
  const branchTypes = types.filter(t => t.branch_id === branchId);
  const branchEmps = emps.filter(e => e.branch_id === branchId);
  const selType = types.find(t => t.id === typeId);

  function openAdd() {
    setDescription(''); setBranchId(''); setEmployeeId(''); setTypeId('');
    setDocDate(today()); setExpiryDate(''); setFile(null); setOpenDd(null);
    setShowAdd(true);
  }

  function recalcExpiry(t: TType | undefined, date: string) {
    if (t?.expiry_days && date) setExpiryDate(addDays(date, t.expiry_days));
    else if (t && !t.expiry_days) setExpiryDate('');
  }

  async function pickFile() {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
      if (!r.canceled && r.assets[0]) setFile(r.assets[0]);
    } catch { notify('Error', 'Could not pick file.'); }
  }

  async function save() {
    if (!branchId) return notify('Branch needed', 'Please choose a branch.');
    if (!employeeId) return notify('Employee needed', 'Please choose an employee.');
    if (!selType) return notify('Training needed', 'Please choose the training.');
    if (!docDate) return notify('Date needed', 'Please choose the date the training was done.');
    if (!file) return notify('File needed', 'Please attach the certificate / document.');

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const ext = (file.name.split('.').pop() ?? 'pdf').toLowerCase();
      const path = `training_${Date.now()}.${ext}`;
      const bytes = await fileToUint8Array(file.uri);

      const { error: upErr } = await supabase.storage.from('documents').upload(path, bytes, {
        contentType: file.mimeType ?? 'application/octet-stream',
      });
      if (upErr) { notify('Upload error', upErr.message); setSaving(false); return; }

      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
      const { error } = await supabase.from('documents').insert({
        name: selType.name,
        description: description.trim() || null,
        category: 'training',
        training_type_id: selType.id,
        file_url: urlData.publicUrl,
        file_type: ext,
        employee_id: employeeId,
        uploaded_by: userData.user?.id,
        visible_to_employee: true,
        document_date: docDate,
        expiry_date: expiryDate || null,
      });
      if (error) { notify('Error', error.message); setSaving(false); return; }

      setShowAdd(false);
      load();
    } catch (e: any) {
      notify('Error', e?.message ?? 'Something went wrong.');
    }
    setSaving(false);
  }

  function remove(d: TDoc) {
    confirm('Delete training record', `Delete "${d.name}"? This cannot be undone.`, async () => {
      const { error } = await supabase.from('documents').delete().eq('id', d.id);
      if (error) notify('Error', error.message);
      else load();
    });
  }

  function statusOf(left: number | null) {
    if (left === null) return { text: 'No expiry', color: theme.muted };
    if (left < 0) return { text: `Expired ${-left} day${left === -1 ? '' : 's'} ago`, color: '#ef4444' };
    if (left === 0) return { text: 'Expires today', color: '#ef4444' };
    if (left <= 60) return { text: `Expires in ${left} day${left === 1 ? '' : 's'}`, color: '#f59e0b' };
    return { text: `Valid · ${left} days left`, color: '#10b981' };
  }

  if (!allowed) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <Text style={{ color: theme.subtext, textAlign: 'center' }}>You don't have access to Training.</Text>
      </View>
    );
  }

  const Dd = ({ id, label, value, placeholder, disabled, children }: any) => (
    <View style={{ marginBottom: 18 }}>
      <Text style={[styles.label, { color: theme.subtext }]}>{label}</Text>
      <TouchableOpacity
        disabled={disabled}
        style={[styles.ddBtn, { backgroundColor: theme.input, borderColor: theme.border, opacity: disabled ? 0.5 : 1 }]}
        onPress={() => setOpenDd(openDd === id ? null : id)}
      >
        <Text style={{ color: value ? theme.text : theme.subtext, fontSize: 15, flex: 1 }} numberOfLines={1}>{value || placeholder}</Text>
        <ChevronDown color={theme.muted} size={16} />
      </TouchableOpacity>
      {openDd === id && (
        <View style={[styles.ddList, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled>{children}</ScrollView>
        </View>
      )}
    </View>
  );

  const Opt = ({ text, sub, on, onPress }: any) => (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.ddItem, { borderBottomColor: theme.border }, on && { backgroundColor: `${colors.yellow}20` }]}
    >
      <Text style={{ color: on ? colors.yellow : theme.text, fontSize: 14, flex: 1 }}>{text}</Text>
      {!!sub && <Text style={{ color: theme.muted, fontSize: 12 }}>{sub}</Text>}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 40 }}>
          <ArrowLeft color={colors.yellow} size={24} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <GraduationCap color={colors.yellow} size={20} />
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>Training</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Plus color={colors.black} size={20} />
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View style={{ padding: 16, paddingBottom: 8, gap: 10 }}>
        <View style={[styles.search, { backgroundColor: theme.input, borderColor: theme.border }]}>
          <Search color={theme.muted} size={16} />
          <TextInput
            style={{ flex: 1, color: theme.text, fontSize: 14 }}
            placeholder="Search employee or training..."
            placeholderTextColor={theme.subtext}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {[{ id: null as string | null, name: 'All branches' }, ...branches].map(b => {
            const on = branchFilter === b.id;
            return (
              <TouchableOpacity
                key={b.id ?? 'all'}
                onPress={() => setBranchFilter(b.id)}
                style={[styles.chip, { borderColor: on ? colors.yellow : theme.border, backgroundColor: on ? `${colors.yellow}20` : theme.card }]}
              >
                <Text style={{ color: on ? colors.yellow : theme.text, fontSize: 13, fontWeight: '600' }}>{b.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([['all', 'All'], ['soon', 'Expiring soon'], ['expired', 'Expired']] as const).map(([k, l]) => {
            const on = statusFilter === k;
            return (
              <TouchableOpacity
                key={k}
                onPress={() => setStatusFilter(k)}
                style={[styles.chip, { borderColor: on ? colors.yellow : theme.border, backgroundColor: on ? `${colors.yellow}20` : theme.card }]}
              >
                <Text style={{ color: on ? colors.yellow : theme.text, fontSize: 13, fontWeight: '600' }}>{l}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.yellow} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.yellow} />}
        >
          <Text style={{ color: theme.muted, fontSize: 12 }}>{rows.length} record{rows.length !== 1 ? 's' : ''}</Text>
          {rows.length === 0 ? (
            <Text style={{ color: theme.muted, textAlign: 'center', marginTop: 40 }}>
              No training records yet. Tap + to add one.
            </Text>
          ) : rows.map(({ d, emp, branch, left }) => {
            const st = statusOf(left);
            return (
              <View key={d.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={[styles.icon, { backgroundColor: `${colors.yellow}20` }]}>
                    <FileText color={colors.yellow} size={20} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{d.name}</Text>
                    <Text style={{ color: theme.subtext, fontSize: 13 }}>
                      {emp?.full_name ?? 'Unknown employee'}{branch ? ` · ${branch.name}` : ''}
                    </Text>
                    {!!d.description && <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>{d.description}</Text>}
                    <Text style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>
                      Done {d.document_date ? new Date(d.document_date + 'T00:00:00').toLocaleDateString('en-ZA') : '—'}
                      {d.expiry_date ? ` · Expires ${new Date(d.expiry_date + 'T00:00:00').toLocaleDateString('en-ZA')}` : ''}
                    </Text>
                    <Text style={{ color: st.color, fontSize: 12.5, fontWeight: '700', marginTop: 3 }}>{st.text}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <TouchableOpacity onPress={() => Linking.openURL(d.file_url)} hitSlop={8}>
                      <Text style={{ color: colors.yellow, fontWeight: '700', fontSize: 13 }}>View</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => remove(d)} hitSlop={8}>
                      <Trash2 color="#ef4444" size={16} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Add training */}
      <Modal visible={showAdd} animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={{ flex: 1, backgroundColor: theme.background }}>
          <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: theme.card, borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setShowAdd(false)} style={{ width: 40 }}><X color={theme.muted} size={24} /></TouchableOpacity>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>Add Training</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.label, { color: theme.subtext }]}>DESCRIPTION (OPTIONAL)</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text, marginBottom: 18 }]}
                placeholder="e.g. Renewal after medical clinic visit"
                placeholderTextColor={theme.subtext}
                value={description}
                onChangeText={setDescription}
                multiline
              />

              <Dd id="branch" label="BRANCH *" value={branchById[branchId]?.name} placeholder="Select branch">
                {branches.map(b => (
                  <Opt key={b.id} text={b.name} on={b.id === branchId} onPress={() => {
                    setBranchId(b.id); setEmployeeId(''); setTypeId(''); setExpiryDate(''); setOpenDd(null);
                  }} />
                ))}
              </Dd>

              <Dd id="employee" label="EMPLOYEE *" value={empById[employeeId]?.full_name ?? ''} disabled={!branchId}
                  placeholder={branchId ? (branchEmps.length ? 'Select employee' : 'No employees in this branch') : 'Choose a branch first'}>
                {branchEmps.map(e => (
                  <Opt key={e.id} text={e.full_name ?? 'Unnamed'} on={e.id === employeeId} onPress={() => { setEmployeeId(e.id); setOpenDd(null); }} />
                ))}
              </Dd>

              <Dd id="type" label={`TRAINING${branchId ? ` — ${branchById[branchId]?.name}` : ''} *`}
                  value={selType ? `${selType.name}${selType.expiry_days ? ` · ${selType.expiry_days} days` : ''}` : ''}
                  disabled={!branchId}
                  placeholder={branchId ? (branchTypes.length ? 'Select training' : 'No training set up for this branch') : 'Choose a branch first'}>
                {branchTypes.map(t => (
                  <Opt key={t.id} text={t.name} sub={t.expiry_days ? `${t.expiry_days} days` : 'No expiry'} on={t.id === typeId}
                       onPress={() => { setTypeId(t.id); recalcExpiry(t, docDate); setOpenDd(null); }} />
                ))}
              </Dd>

              <Text style={[styles.label, { color: theme.subtext }]}>DATE DONE *</Text>
              <DatePickerField
                value={docDate}
                onChange={v => { setDocDate(v); recalcExpiry(selType, v); }}
                isDark={isDark}
                theme={theme}
                style={{ marginBottom: 18 }}
              />

              <Text style={[styles.label, { color: theme.subtext }]}>EXPIRY DATE</Text>
              <DatePickerField value={expiryDate} onChange={setExpiryDate} placeholder="No expiry" isDark={isDark} theme={theme} />
              <Text style={{ color: theme.muted, fontSize: 12, marginTop: 6, marginBottom: 18 }}>
                {selType?.expiry_days
                  ? `Set automatically: ${selType.expiry_days} days after the date done. You can change it.`
                  : 'Choose the training to set this automatically.'}
              </Text>

              <Text style={[styles.label, { color: theme.subtext }]}>CERTIFICATE / DOCUMENT *</Text>
              <TouchableOpacity
                style={[styles.fileBtn, { borderColor: file ? colors.yellow : theme.border, backgroundColor: theme.input }]}
                onPress={pickFile}
              >
                <Upload color={file ? colors.yellow : theme.muted} size={18} />
                <Text style={{ color: file ? theme.text : theme.subtext, flex: 1 }} numberOfLines={1}>
                  {file ? file.name : 'Choose PDF or image'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={save}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color={colors.black} /> : <Text style={{ color: colors.black, fontWeight: '700', fontSize: 16 }}>Save training</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  addBtn: { backgroundColor: colors.yellow, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  textInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, minHeight: 48 },
  ddBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 48, gap: 8 },
  ddList: { borderWidth: 1, borderRadius: 12, marginTop: 6, overflow: 'hidden' },
  ddItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, gap: 8 },
  fileBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 48, marginBottom: 22 },
  saveBtn: { backgroundColor: colors.yellow, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' },
});
