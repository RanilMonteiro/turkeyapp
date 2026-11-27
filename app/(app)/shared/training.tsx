import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput,
  useColorScheme, ActivityIndicator, Modal, Platform, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Plus, X, Search, ChevronDown, Upload, Trash2, GraduationCap,
  MapPin, Pencil, Check, ListChecks, Users,
} from 'lucide-react-native';
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

// ── Spreadsheet look (sampled from the reference screenshot) ──────────
const XL = {
  headerGrey: '#a2aaad',
  cellGrey: '#d8d8d8',
  emptyGrey: '#666666',
  nameGreen: '#00ff00',
  brown: '#993300',
  valid: '#38761d',
  soon: '#be531c',
  expired: '#971b2f',
  legendValid: '#4a773c',
  legendSoon: '#be531c',
  legendExpired: '#971b2f',
  legendRed: '#ff0000',
};

const NO_W = 46;
const NAME_W = 280;
const UNIT_W = 170;
const GUT_W = 14;
const DATE_W = 112;
const STAT_W = 104;
const ROW_H = 34;
const HEAD_TOP_H = 100;
const HEAD_SUB_H = 150;

type Site = { id: string; name: string };
type Emp = { id: string; full_name: string | null };
type TType = { id: string; name: string; expiry_days: number | null; sort_order: number; training_site_id: string | null };
type Col = { id: string; name: string; expiry_days: number | null; ids: string[] };
type TDoc = {
  id: string; name: string; description: string | null; file_url: string;
  document_date: string | null; expiry_date: string | null;
  employee_id: string | null; training_type_id: string | null;
};
type Rec = { mode: 'add' | 'edit'; doc?: TDoc; employeeId: string; colId: string; locked: boolean };

const pad = (n: number) => String(n).padStart(2, '0');
const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => toStr(new Date());
const midnight = (s: string) => new Date(s + 'T00:00:00');
const fmt = (s: string | null) => (s ? s.replace(/-/g, '/') : '');

function addDays(dateStr: string, days: number): string {
  const d = midnight(dateStr);
  d.setDate(d.getDate() + days);
  return toStr(d);
}
function daysBetween(from: string, to: Date): number {
  const t = new Date(to); t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - midnight(from).getTime()) / 86400000);
}
function daysLeft(expiry: string | null): number | null {
  if (!expiry) return null;
  return -daysBetween(expiry, new Date());
}

function expiryLabel(days: number | null) {
  if (!days) return '';
  if (days % 365 === 0) { const y = days / 365; return `(Expiry Date ${y} year${y === 1 ? '' : 's'}) ${days} Days`; }
  return `(Expiry ${Math.round(days / 30.4167)} Months) ${days} Days`;
}

async function fileToUint8Array(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    return new Uint8Array(await blob.arrayBuffer());
  }
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

const isWeb = Platform.OS === 'web';
const sticky = (left: number | null, top: number | null, z: number): any =>
  isWeb ? { position: 'sticky', ...(left !== null ? { left } : {}), ...(top !== null ? { top } : {}), zIndex: z } : {};

// ── Small shared UI bits ──────────────────────────────────────────────
function Dd({ label, value, placeholder, disabled, open, onToggle, theme, children }: any) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={[styles.label, { color: theme.subtext }]}>{label}</Text>
      <TouchableOpacity
        disabled={disabled}
        style={[styles.ddBtn, { backgroundColor: theme.input, borderColor: theme.border, opacity: disabled ? 0.5 : 1 }]}
        onPress={onToggle}
      >
        <Text style={{ color: value ? theme.text : theme.subtext, fontSize: 15, flex: 1 }} numberOfLines={1}>{value || placeholder}</Text>
        <ChevronDown color={theme.muted} size={16} />
      </TouchableOpacity>
      {open && (
        <View style={[styles.ddList, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled>{children}</ScrollView>
        </View>
      )}
    </View>
  );
}

function Opt({ text, sub, on, onPress, theme }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.ddItem, { borderBottomColor: theme.border }, on && { backgroundColor: `${colors.yellow}20` }]}
    >
      <Text style={{ color: on ? colors.yellow : theme.text, fontSize: 14, flex: 1 }}>{text}</Text>
      {!!sub && <Text style={{ color: theme.muted, fontSize: 12 }}>{sub}</Text>}
    </TouchableOpacity>
  );
}

function ModalShell({ title, onClose, theme, insetsTop, children }: any) {
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={[styles.header, { paddingTop: insetsTop + 12, backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={onClose} style={{ width: 40 }}><X color={theme.muted} size={24} /></TouchableOpacity>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>{title}</Text>
          <View style={{ width: 40 }} />
        </View>
        {children}
      </View>
    </Modal>
  );
}

// Rotated text box (real size w × h)
function Rot({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
  return (
    <View style={{ width: w, height: h, overflow: 'hidden' }}>
      <View style={{
        position: 'absolute', width: h, height: w, left: (w - h) / 2, top: (h - w) / 2,
        transform: [{ rotate: '-90deg' }], justifyContent: 'center',
      }}>
        {children}
      </View>
    </View>
  );
}

// ── Manage training sites (add / edit / delete) ───────────────────────
function SitesModal({ sites, counts, theme, insetsTop, onClose, onChanged, onAssign }: any) {
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    const { error } = await supabase.from('training_sites').insert({ name });
    setBusy(false);
    if (error) return notify('Error', error.message);
    setNewName(''); onChanged();
  }
  async function saveEdit() {
    const name = editName.trim();
    if (!editId || !name) return;
    setBusy(true);
    const { error } = await supabase.from('training_sites').update({ name }).eq('id', editId);
    setBusy(false);
    if (error) return notify('Error', error.message);
    setEditId(null); onChanged();
  }
  function remove(s: Site) {
    const n = counts[s.id] ?? 0;
    confirm('Delete site', `Delete "${s.name}" and its trainings?${n ? ` ${n} employee${n === 1 ? ' is' : 's are'} assigned to it.` : ''} Saved training records for it may block this.`, async () => {
      const { error } = await supabase.from('training_sites').delete().eq('id', s.id);
      if (error) notify('Error', error.message); else onChanged();
    });
  }

  return (
    <ModalShell title="Training Sites" onClose={onClose} theme={theme} insetsTop={insetsTop}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.label, { color: theme.subtext }]}>ADD A SITE</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[styles.textInput, { flex: 1, backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
              placeholder="Site name" placeholderTextColor={theme.subtext}
              value={newName} onChangeText={setNewName} onSubmitEditing={add}
            />
            <TouchableOpacity style={[styles.smallBtn, busy && { opacity: 0.6 }]} onPress={add} disabled={busy}>
              <Plus color={colors.black} size={20} />
            </TouchableOpacity>
          </View>
          <Text style={{ color: theme.muted, fontSize: 12, marginTop: 8 }}>
            These sites are only used by the Training matrix. They are not linked to your real sites.
          </Text>
        </View>

        {sites.length === 0 && <Text style={{ color: theme.muted, textAlign: 'center', marginTop: 20 }}>No sites yet.</Text>}
        {sites.map((s: Site) => (
          <View key={s.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
            {editId === s.id ? (
              <>
                <TextInput
                  autoFocus
                  style={[styles.textInput, { flex: 1, backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                  value={editName} onChangeText={setEditName} onSubmitEditing={saveEdit}
                />
                <TouchableOpacity onPress={saveEdit} hitSlop={8}><Check color="#10b981" size={22} /></TouchableOpacity>
                <TouchableOpacity onPress={() => setEditId(null)} hitSlop={8}><X color={theme.muted} size={22} /></TouchableOpacity>
              </>
            ) : (
              <>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{s.name}</Text>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>{counts[s.id] ?? 0} employee{(counts[s.id] ?? 0) === 1 ? '' : 's'}</Text>
                </View>
                <TouchableOpacity onPress={() => onAssign(s)} hitSlop={8}><Users color="#3b82f6" size={18} /></TouchableOpacity>
                <TouchableOpacity onPress={() => { setEditId(s.id); setEditName(s.name); }} hitSlop={8}><Pencil color={colors.yellow} size={18} /></TouchableOpacity>
                <TouchableOpacity onPress={() => remove(s)} hitSlop={8}><Trash2 color="#ef4444" size={18} /></TouchableOpacity>
              </>
            )}
          </View>
        ))}
      </ScrollView>
    </ModalShell>
  );
}

// ── Choose which employees are on one site ───────────────────────────
function SiteEmployeesModal({ site, emps, memberIds, theme, insetsTop, onClose, onChanged }: any) {
  const [members, setMembers] = useState<Set<string>>(new Set(memberIds));
  const [q, setQ] = useState('');
  const shown: Emp[] = emps.filter((e: Emp) => (e.full_name ?? '').toLowerCase().includes(q.trim().toLowerCase()));

  async function toggle(id: string) {
    const on = members.has(id);
    setMembers(m => { const n = new Set(m); on ? n.delete(id) : n.add(id); return n; });
    const { error } = on
      ? await supabase.from('training_employee_sites').delete().eq('employee_id', id).eq('site_id', site.id)
      : await supabase.from('training_employee_sites').insert({ employee_id: id, site_id: site.id });
    if (error) notify('Error', error.message); else onChanged();
  }
  async function selectShown() {
    const add = shown.filter(e => !members.has(e.id));
    if (!add.length) return;
    setMembers(m => new Set([...m, ...add.map(e => e.id)]));
    const { error } = await supabase.from('training_employee_sites').insert(add.map(e => ({ employee_id: e.id, site_id: site.id })));
    if (error) notify('Error', error.message); else onChanged();
  }
  async function clearShown() {
    const rm = shown.filter(e => members.has(e.id)).map(e => e.id);
    if (!rm.length) return;
    setMembers(m => { const n = new Set(m); rm.forEach(id => n.delete(id)); return n; });
    const { error } = await supabase.from('training_employee_sites').delete().eq('site_id', site.id).in('employee_id', rm);
    if (error) notify('Error', error.message); else onChanged();
  }

  return (
    <ModalShell title={`${site.name} · Employees`} onClose={onClose} theme={theme} insetsTop={insetsTop}>
      <View style={{ padding: 16, paddingBottom: 8, gap: 10 }}>
        <View style={[styles.search, { backgroundColor: theme.input, borderColor: theme.border }]}>
          <Search color={theme.muted} size={16} />
          <TextInput style={{ flex: 1, color: theme.text, fontSize: 14 }} placeholder="Search employee..." placeholderTextColor={theme.subtext} value={q} onChangeText={setQ} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TouchableOpacity onPress={selectShown} style={[styles.chip, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600' }}>Select all{q ? ' shown' : ''}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={clearShown} style={[styles.chip, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600' }}>Clear{q ? ' shown' : ''}</Text>
          </TouchableOpacity>
          <Text style={{ color: theme.muted, fontSize: 12, marginLeft: 'auto' }}>{members.size} on this site</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4 }}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, padding: 0, overflow: 'hidden' }]}>
          {shown.map(e => {
            const on = members.has(e.id);
            return (
              <TouchableOpacity key={e.id} onPress={() => toggle(e.id)} style={[styles.ddItem, { borderBottomColor: theme.border }]}>
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? colors.yellow : theme.muted, backgroundColor: on ? colors.yellow : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {on && <Check color={colors.black} size={14} />}
                </View>
                <Text style={{ color: theme.text, fontSize: 15, flex: 1 }}>{e.full_name ?? 'Unnamed'}</Text>
              </TouchableOpacity>
            );
          })}
          {shown.length === 0 && <Text style={{ color: theme.muted, textAlign: 'center', padding: 20 }}>No employees found.</Text>}
        </View>
      </ScrollView>
    </ModalShell>
  );
}

// ── Choose which sites one employee is on ─────────────────────────────
function EmployeeSitesModal({ emp, sites, selected, theme, onClose, onSave }: any) {
  const [sel, setSel] = useState<string[]>(selected);
  const all = sites.length > 0 && sel.length === sites.length;
  const toggle = (id: string) => setSel(a => (a.includes(id) ? a.filter(x => x !== id) : [...a, id]));
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.border }]} onStartShouldSetResponder={() => true}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16, padding: 14 }}>Sites · {emp.full_name}</Text>
          <ScrollView style={{ maxHeight: 360 }}>
            <Opt theme={theme} text="All sites" on={all} onPress={() => setSel(all ? [] : sites.map((s: Site) => s.id))} />
            {sites.map((s: Site) => (
              <Opt key={s.id} theme={theme} text={s.name} on={sel.includes(s.id)} onPress={() => toggle(s.id)} />
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8, padding: 14 }}>
            <TouchableOpacity style={[styles.saveBtn, { flex: 1, height: 44 }]} onPress={() => onSave(sel)}>
              <Text style={{ color: colors.black, fontWeight: '700' }}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, { height: 44, paddingHorizontal: 18, backgroundColor: theme.input }]} onPress={onClose}>
              <Text style={{ color: theme.text, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Manage trainings (the matrix columns) ─────────────────────────────
function TrainingsModal({ cols, siteId, siteName, theme, insetsTop, onClose, onChanged }: any) {
  const [name, setName] = useState('');
  const [days, setDays] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() { setName(''); setDays(''); setEditId(null); }

  async function save() {
    const n = name.trim();
    if (!n) return notify('Name needed', 'Please enter the training name.');
    const d = days.trim() ? parseInt(days, 10) : null;
    if (days.trim() && (!d || d <= 0)) return notify('Days', 'Validity must be a number of days, or empty for no expiry.');
    setBusy(true);
    let error;
    if (editId) {
      const col = cols.find((c: Col) => c.id === editId) as Col;
      ({ error } = await supabase.from('training_types').update({ name: n, expiry_days: d }).in('id', col.ids));
    } else {
      ({ error } = await supabase.from('training_types').insert({ name: n, expiry_days: d, sort_order: cols.length + 1, training_site_id: siteId }));
    }
    setBusy(false);
    if (error) return notify('Error', error.message);
    reset(); onChanged();
  }
  function remove(c: Col) {
    confirm('Delete training', `Delete the "${c.name}" column? Records already saved for it may block this.`, async () => {
      const { error } = await supabase.from('training_types').delete().in('id', c.ids);
      if (error) notify('Error', error.message); else onChanged();
    });
  }

  return (
    <ModalShell title={`${siteName} · Trainings`} onClose={onClose} theme={theme} insetsTop={insetsTop}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.label, { color: theme.subtext }]}>{editId ? 'EDIT TRAINING' : 'ADD A TRAINING'}</Text>
          <TextInput
            style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text, marginBottom: 10 }]}
            placeholder="e.g. Medical" placeholderTextColor={theme.subtext} value={name} onChangeText={setName}
          />
          <TextInput
            style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text, marginBottom: 10 }]}
            placeholder="Valid for how many days? (e.g. 365, empty = no expiry)" placeholderTextColor={theme.subtext}
            value={days} onChangeText={t => setDays(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad"
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[styles.saveBtn, { flex: 1, height: 46 }, busy && { opacity: 0.6 }]} onPress={save} disabled={busy}>
              <Text style={{ color: colors.black, fontWeight: '700' }}>{editId ? 'Save changes' : 'Add training'}</Text>
            </TouchableOpacity>
            {editId && (
              <TouchableOpacity style={[styles.saveBtn, { height: 46, paddingHorizontal: 18, backgroundColor: theme.input }]} onPress={reset}>
                <Text style={{ color: theme.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {cols.length === 0 && <Text style={{ color: theme.muted, textAlign: 'center', marginTop: 20 }}>No trainings yet.</Text>}
        {cols.map((c: Col) => (
          <View key={c.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{c.name}</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>{c.expiry_days ? `${c.expiry_days} days` : 'No expiry'}</Text>
            </View>
            <TouchableOpacity onPress={() => { setEditId(c.id); setName(c.name); setDays(c.expiry_days ? String(c.expiry_days) : ''); }} hitSlop={8}><Pencil color={colors.yellow} size={18} /></TouchableOpacity>
            <TouchableOpacity onPress={() => remove(c)} hitSlop={8}><Trash2 color="#ef4444" size={18} /></TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </ModalShell>
  );
}

// ── Add / edit one training record ────────────────────────────────────
function RecordModal({ rec, emps, cols, theme, isDark, insetsTop, onClose, onSaved }: any) {
  const editing = rec.mode === 'edit';
  const [employeeId, setEmployeeId] = useState<string>(rec.employeeId);
  const [colId, setColId] = useState<string>(rec.colId);
  const [description, setDescription] = useState(rec.doc?.description ?? '');
  const [docDate, setDocDate] = useState(rec.doc?.document_date ?? today());
  const initCol: Col | undefined = cols.find((c: Col) => c.id === rec.colId);
  const [expiryDate, setExpiryDate] = useState<string>(
    rec.doc ? (rec.doc.expiry_date ?? '') : initCol?.expiry_days ? addDays(today(), initCol.expiry_days) : ''
  );
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [saving, setSaving] = useState(false);
  const [openDd, setOpenDd] = useState<'employee' | 'type' | null>(null);

  const col: Col | undefined = cols.find((c: Col) => c.id === colId);
  const emp: Emp | undefined = emps.find((e: Emp) => e.id === employeeId);

  function recalc(c: Col | undefined, date: string) {
    if (c?.expiry_days && date) setExpiryDate(addDays(date, c.expiry_days));
    else if (c && !c.expiry_days) setExpiryDate('');
  }

  async function pickFile() {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
      if (!r.canceled && r.assets[0]) setFile(r.assets[0]);
    } catch { notify('Error', 'Could not pick file.'); }
  }

  async function upload(f: DocumentPicker.DocumentPickerAsset) {
    const ext = (f.name.split('.').pop() ?? 'pdf').toLowerCase();
    const path = `training_${Date.now()}.${ext}`;
    const bytes = await fileToUint8Array(f.uri);
    const { error } = await supabase.storage.from('documents').upload(path, bytes, {
      contentType: f.mimeType ?? 'application/octet-stream',
    });
    if (error) throw new Error(error.message);
    return { url: supabase.storage.from('documents').getPublicUrl(path).data.publicUrl, ext };
  }

  async function save() {
    if (!employeeId) return notify('Employee needed', 'Please choose an employee.');
    if (!col) return notify('Training needed', 'Please choose the training.');
    if (!docDate) return notify('Date needed', 'Please choose the date the training was done.');
    if (!editing && !file) return notify('File needed', 'Please attach the certificate / document.');

    setSaving(true);
    try {
      const up = file ? await upload(file) : null;
      if (editing && rec.doc) {
        const patch: any = {
          description: description.trim() || null,
          document_date: docDate,
          expiry_date: expiryDate || null,
          employee_id: employeeId,
          training_type_id: col.ids[0],
          name: col.name,
        };
        if (up) { patch.file_url = up.url; patch.file_type = up.ext; }
        const { error } = await supabase.from('documents').update(patch).eq('id', rec.doc.id);
        if (error) throw new Error(error.message);
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase.from('documents').insert({
          name: col.name,
          description: description.trim() || null,
          category: 'training',
          training_type_id: col.ids[0],
          file_url: up!.url,
          file_type: up!.ext,
          employee_id: employeeId,
          uploaded_by: userData.user?.id,
          visible_to_employee: true,
          document_date: docDate,
          expiry_date: expiryDate || null,
        });
        if (error) throw new Error(error.message);
      }
      onSaved();
    } catch (e: any) {
      notify('Error', e?.message ?? 'Something went wrong.');
    }
    setSaving(false);
  }

  function remove() {
    if (!rec.doc) return;
    confirm('Delete training record', `Delete "${rec.doc.name}" for ${emp?.full_name ?? 'this employee'}? This cannot be undone.`, async () => {
      const { error } = await supabase.from('documents').delete().eq('id', rec.doc.id);
      if (error) notify('Error', error.message); else onSaved();
    });
  }

  return (
    <ModalShell title={editing ? 'Edit Training' : 'Add Training'} onClose={onClose} theme={theme} insetsTop={insetsTop}>
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {rec.locked ? (
            <View style={{ marginBottom: 18 }}>
              <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800' }}>{emp?.full_name ?? 'Unnamed'}</Text>
              <Text style={{ color: colors.yellow, fontSize: 14, fontWeight: '700', marginTop: 2 }}>{col?.name}</Text>
            </View>
          ) : (
            <>
              <Dd label="EMPLOYEE *" value={emp?.full_name ?? ''} placeholder="Select employee" theme={theme}
                  open={openDd === 'employee'} onToggle={() => setOpenDd(openDd === 'employee' ? null : 'employee')}>
                {emps.map((e: Emp) => (
                  <Opt key={e.id} theme={theme} text={e.full_name ?? 'Unnamed'} on={e.id === employeeId}
                       onPress={() => { setEmployeeId(e.id); setOpenDd(null); }} />
                ))}
              </Dd>
              <Dd label="TRAINING *" value={col ? `${col.name}${col.expiry_days ? ` · ${col.expiry_days} days` : ''}` : ''}
                  placeholder={cols.length ? 'Select training' : 'No trainings set up yet'} disabled={!cols.length} theme={theme}
                  open={openDd === 'type'} onToggle={() => setOpenDd(openDd === 'type' ? null : 'type')}>
                {cols.map((c: Col) => (
                  <Opt key={c.id} theme={theme} text={c.name} sub={c.expiry_days ? `${c.expiry_days} days` : 'No expiry'} on={c.id === colId}
                       onPress={() => { setColId(c.id); recalc(c, docDate); setOpenDd(null); }} />
                ))}
              </Dd>
            </>
          )}

          <Text style={[styles.label, { color: theme.subtext }]}>DATE DONE *</Text>
          <DatePickerField
            value={docDate}
            onChange={(v: string) => { setDocDate(v); recalc(col, v); }}
            isDark={isDark} theme={theme} style={{ marginBottom: 18 }}
          />

          <Text style={[styles.label, { color: theme.subtext }]}>EXPIRY DATE</Text>
          <DatePickerField value={expiryDate} onChange={setExpiryDate} placeholder="No expiry" isDark={isDark} theme={theme} />
          <Text style={{ color: theme.muted, fontSize: 12, marginTop: 6, marginBottom: 18 }}>
            {col?.expiry_days
              ? `Set automatically: ${col.expiry_days} days after the date done. You can change it.`
              : 'Choose the training to set this automatically.'}
          </Text>

          <Text style={[styles.label, { color: theme.subtext }]}>DESCRIPTION (OPTIONAL)</Text>
          <TextInput
            style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text, marginBottom: 18 }]}
            placeholder="e.g. Renewal after medical clinic visit" placeholderTextColor={theme.subtext}
            value={description} onChangeText={setDescription} multiline
          />

          <Text style={[styles.label, { color: theme.subtext }]}>{editing ? 'CERTIFICATE / DOCUMENT' : 'CERTIFICATE / DOCUMENT *'}</Text>
          {editing && rec.doc?.file_url && (
            <TouchableOpacity onPress={() => Linking.openURL(rec.doc.file_url)} style={{ marginBottom: 10 }}>
              <Text style={{ color: colors.yellow, fontWeight: '700', fontSize: 14 }}>View current certificate</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.fileBtn, { borderColor: file ? colors.yellow : theme.border, backgroundColor: theme.input }]}
            onPress={pickFile}
          >
            <Upload color={file ? colors.yellow : theme.muted} size={18} />
            <Text style={{ color: file ? theme.text : theme.subtext, flex: 1 }} numberOfLines={1}>
              {file ? file.name : editing ? 'Replace file (PDF or image)' : 'Choose PDF or image'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.black} /> : <Text style={{ color: colors.black, fontWeight: '700', fontSize: 16 }}>{editing ? 'Save changes' : 'Save training'}</Text>}
          </TouchableOpacity>

          {editing && (
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#ef4444', marginTop: 10 }]} onPress={remove}>
              <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 16 }}>Delete record</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </ModalShell>
  );
}

// ── Scroll container: one scroller on web (so sticky works), nested on phones
function MatrixScroller({ children, width }: { children: React.ReactNode; width: number }) {
  if (isWeb) {
    return <View style={[{ flex: 1, backgroundColor: '#000' }, { overflow: 'auto' } as any]}><View style={{ width }}>{children}</View></View>;
  }
  return (
    <ScrollView horizontal style={{ flex: 1, backgroundColor: '#000' }} contentContainerStyle={{ width }}>
      <ScrollView nestedScrollEnabled stickyHeaderIndices={[2]} style={{ width }}>{children}</ScrollView>
    </ScrollView>
  );
}

// ── Page ──────────────────────────────────────────────────────────────
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
  const [docs, setDocs] = useState<TDoc[]>([]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [assign, setAssign] = useState<Record<string, string[]>>({});
  const [activeSite, setActiveSite] = useState<string>('');
  const [types, setTypes] = useState<TType[]>([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'soon' | 'expired'>('all');

  const [rec, setRec] = useState<Rec | null>(null);
  const [showSites, setShowSites] = useState(false);
  const [showTypes, setShowTypes] = useState(false);
  const [unitFor, setUnitFor] = useState<string | null>(null);
  const [siteEmpsFor, setSiteEmpsFor] = useState<Site | null>(null);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const [d, e, s, a, t] = await Promise.all([
      supabase.from('documents')
        .select('id, name, description, file_url, document_date, expiry_date, employee_id, training_type_id')
        .eq('category', 'training'),
      supabase.from('profiles').select('id, full_name').neq('role', 'superuser').eq('is_archived', false).order('full_name'),
      supabase.from('training_sites').select('id, name').order('created_at').order('name'),
      supabase.from('training_employee_sites').select('employee_id, site_id'),
      supabase.from('training_types').select('id, name, expiry_days, sort_order, training_site_id').order('sort_order'),
    ]);
    if (d.error) notify('Error', d.error.message);
    if (s.error || a.error) notify('Setup needed', 'Run supabase/training_matrix.sql in Supabase to create the training sites tables.');
    setDocs((d.data as TDoc[]) ?? []);
    setEmps((e.data as Emp[]) ?? []);
    setSites((s.data as Site[]) ?? []);
    const am: Record<string, string[]> = {};
    for (const r of ((a.data as any[]) ?? [])) { if (r.site_id) (am[r.employee_id] ||= []).push(r.site_id); }
    setAssign(am);
    const siteList = (s.data as Site[]) ?? [];
    setActiveSite(cur => (cur === 'unassigned' || siteList.some(x => x.id === cur) ? cur : siteList[0]?.id ?? 'unassigned'));
    setTypes((t.data as TType[]) ?? []);
    setLoading(false);
  }

  // Each site has its own training columns.
  const cols: Col[] = useMemo(() =>
    types
      .filter(t => t.training_site_id === activeSite)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(t => ({ id: t.id, name: t.name.trim(), expiry_days: t.expiry_days, ids: [t.id] })),
  [types, activeSite]);

  // latest record per employee + training
  const cell = useMemo(() => {
    const m: Record<string, TDoc> = {};
    for (const d of docs) {
      if (!d.employee_id || !d.training_type_id) continue;
      const k = `${d.employee_id}|${d.training_type_id}`;
      if (!m[k] || (d.document_date ?? '') > (m[k].document_date ?? '')) m[k] = d;
    }
    return m;
  }, [docs]);

  function statusOf(d: TDoc | undefined, col: Col) {
    if (!d || !d.document_date) return null;
    const expiry = d.expiry_date ?? (col.expiry_days ? addDays(d.document_date, col.expiry_days) : null);
    const left = daysLeft(expiry);
    const kind: 'valid' | 'soon' | 'expired' = left === null ? 'valid' : left < 0 ? 'expired' : left <= 30 ? 'soon' : 'valid';
    return { kind, shown: -daysBetween(d.document_date, new Date()) };
  }

  const siteById = useMemo(() => Object.fromEntries(sites.map(s => [s.id, s])), [sites]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of emps) for (const sid of assign[e.id] ?? []) c[sid] = (c[sid] ?? 0) + 1;
    return c;
  }, [emps, assign]);
  const unassignedCount = useMemo(() => emps.filter(e => !(assign[e.id]?.length)).length, [emps, assign]);
  const activeSiteObj = siteById[activeSite] as Site | undefined;

  // everyone on the current tab
  const baseEmps = useMemo(
    () => emps.filter(e => (activeSite === 'unassigned' ? !(assign[e.id]?.length) : (assign[e.id] ?? []).includes(activeSite))),
    [emps, assign, activeSite],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return baseEmps.filter(e => {
      if (q && !(e.full_name ?? '').toLowerCase().includes(q)) return false;
      if (statusFilter !== 'all') {
        const hit = cols.some(c => statusOf(cell[`${e.id}|${c.id}`], c)?.kind === statusFilter);
        if (!hit) return false;
      }
      return true;
    });
  }, [baseEmps, search, statusFilter, cols, cell]);

  async function saveEmployeeSites(employeeId: string, ids: string[]) {
    setUnitFor(null);
    setAssign(a => ({ ...a, [employeeId]: ids }));
    const del = await supabase.from('training_employee_sites').delete().eq('employee_id', employeeId);
    if (del.error) { notify('Error', del.error.message); load(); return; }
    if (ids.length) {
      const ins = await supabase.from('training_employee_sites').insert(ids.map(site_id => ({ employee_id: employeeId, site_id })));
      if (ins.error) notify('Error', ins.error.message);
    }
    load();
  }

  function openCell(employeeId: string, col: Col) {
    const d = cell[`${employeeId}|${col.id}`];
    setRec(d
      ? { mode: 'edit', doc: d, employeeId, colId: col.id, locked: true }
      : { mode: 'add', employeeId, colId: col.id, locked: true });
  }

  if (!allowed) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <Text style={{ color: theme.subtext, textAlign: 'center' }}>You don't have access to Training.</Text>
      </View>
    );
  }

  const totalWidth = NO_W + NAME_W + UNIT_W + cols.length * (GUT_W + DATE_W + STAT_W) + GUT_W;
  const leftW = NO_W + NAME_W;
  const chip = (on: boolean) => [styles.chip, { borderColor: on ? colors.yellow : theme.border, backgroundColor: on ? `${colors.yellow}20` : theme.card }];
  const chipText = (on: boolean) => ({ color: on ? colors.yellow : theme.text, fontSize: 13, fontWeight: '600' as const });

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
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: theme.input }]} onPress={() => (activeSiteObj ? setShowTypes(true) : notify('Pick a site', 'Choose a site tab first, then manage its trainings.'))}>
            <ListChecks color={colors.yellow} size={18} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: theme.input }]} onPress={() => setShowSites(true)}>
            <MapPin color={colors.yellow} size={18} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => (activeSiteObj ? setRec({ mode: 'add', employeeId: '', colId: cols[0]?.id ?? '', locked: false }) : notify('Pick a site', 'Choose a site tab first.'))}
          >
            <Plus color={colors.black} size={20} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ padding: 16, paddingBottom: 10, gap: 10 }}>
        <View style={[styles.search, { backgroundColor: theme.input, borderColor: theme.border }]}>
          <Search color={theme.muted} size={16} />
          <TextInput
            style={{ flex: 1, color: theme.text, fontSize: 14 }}
            placeholder="Search employee..." placeholderTextColor={theme.subtext}
            value={search} onChangeText={setSearch}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {([...sites.map(s => [s.id, `${s.name} (${counts[s.id] ?? 0})`]), ['unassigned', `Unassigned (${unassignedCount})`]] as [string, string][]).map(([k, l]) => (
            <TouchableOpacity key={k} onPress={() => setActiveSite(k)} style={chip(activeSite === k)}>
              <Text style={chipText(activeSite === k)}>{l}</Text>
            </TouchableOpacity>
          ))}
          <View style={{ width: 12 }} />
          {([['all', 'All'], ['soon', 'Expiring soon'], ['expired', 'Expired']] as const).map(([k, l]) => (
            <TouchableOpacity key={k} onPress={() => setStatusFilter(k)} style={chip(statusFilter === k)}>
              <Text style={chipText(statusFilter === k)}>{l}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.yellow} style={{ marginTop: 40 }} />
      ) : (
        <MatrixScroller width={totalWidth}>
          {/* 0 · title row */}
          <View style={{ height: 32, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center' }}>
            <View style={[{ width: leftW, flexDirection: 'row', alignItems: 'center', height: 32, backgroundColor: '#fff' }, sticky(0, null, 12)]}>
              <View style={{ width: NO_W, height: 28, borderWidth: 2, borderColor: '#1a73e8' }} />
              <Text style={{ marginLeft: 10, fontSize: 19, fontWeight: '800', color: '#000', textDecorationLine: 'underline' }} numberOfLines={1}>
                TRAINING MATRIX & NEED ANALYSIS
              </Text>
            </View>
          </View>

          {/* 1 · legend */}
          <View style={{ backgroundColor: '#000' }}>
            <View style={[{ width: leftW, backgroundColor: '#000' }, sticky(0, null, 11)]}>
              <View style={{ height: 30, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
                <Text style={{ color: XL.legendRed, fontWeight: '800', fontSize: 12 }}>LEGEND - Date Format must be: YYYY/MM/DD</Text>
              </View>
              {([
                [XL.legendValid, "Training is Valid (Shows for how many days it's been valid)"],
                [XL.legendSoon, '1 - 30 Days before training expires'],
                [XL.legendExpired, 'Training has expired'],
              ] as const).map(([bg, label]) => (
                <View key={label} style={{ flexDirection: 'row', height: 24 }}>
                  <View style={{ width: NO_W, backgroundColor: bg }} />
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 1, borderStyle: 'dashed', borderColor: '#fff', backgroundColor: '#000' }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11.5 }} numberOfLines={1}>{label}</Text>
                  </View>
                </View>
              ))}
            </View>
            <View style={{ height: 14 }} />
          </View>

          {/* 2 · column header (sticky) */}
          <View style={[{ flexDirection: 'row', backgroundColor: '#000', height: HEAD_TOP_H + HEAD_SUB_H }, isWeb ? ({ position: 'sticky', top: 0, zIndex: 20 } as any) : null]}>
            <View style={[{ flexDirection: 'row', height: HEAD_TOP_H + HEAD_SUB_H, backgroundColor: '#000' }, sticky(0, null, 30)]}>
              <View style={[styles.hCell, { width: NO_W, borderRightWidth: 2 }]}>
                <Text style={styles.hBold}>No</Text>
              </View>
              <View style={[styles.hCell, { width: NAME_W, borderRightWidth: 2 }]}>
                <Text style={[styles.hBold, { fontSize: 15 }]}>Name & Surname of Employee</Text>
              </View>
            </View>
            <View style={[styles.hCell, { width: UNIT_W, borderRightWidth: 0, alignItems: 'flex-start', paddingLeft: 4 }]}>
              <Text style={styles.hBold}>Unit</Text>
            </View>
            {cols.map(c => (
              <View key={c.id} style={{ flexDirection: 'row' }}>
                <View style={{ width: GUT_W, backgroundColor: '#000' }} />
                <View>
                  <View style={{ width: DATE_W + STAT_W, height: HEAD_TOP_H, backgroundColor: XL.headerGrey, justifyContent: 'center', alignItems: 'center', padding: 10, borderBottomWidth: 6, borderColor: '#000' }}>
                    <Text style={{ textAlign: 'center', fontSize: 15, fontWeight: '800', color: '#000' }}>
                      {c.name}{' '}
                      <Text style={{ color: XL.brown }}>{expiryLabel(c.expiry_days) || '(No expiry)'}</Text>
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', height: HEAD_SUB_H - 6 }}>
                    <View style={{ width: DATE_W, backgroundColor: XL.headerGrey, borderRightWidth: 1, borderColor: '#000' }}>
                      <Rot w={DATE_W} h={HEAD_SUB_H - 6}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#000', paddingLeft: 8 }}>Date Done</Text>
                      </Rot>
                    </View>
                    <View style={{ width: STAT_W, backgroundColor: XL.headerGrey }}>
                      <Rot w={STAT_W} h={HEAD_SUB_H - 6}>
                        <Text style={{ fontSize: 12, lineHeight: 15, fontWeight: '800', color: '#000', textAlign: 'center' }}>
                          {'Green - Valid\nOrange - 30 Days\nRed - Expired'}
                        </Text>
                      </Rot>
                    </View>
                  </View>
                </View>
              </View>
            ))}
            <View style={{ width: GUT_W, backgroundColor: '#000' }} />
          </View>

          {/* 3.. · employees */}
          {rows.length === 0 ? (
            <View style={{ height: 80, justifyContent: 'center', paddingLeft: 20 }}>
              <Text style={{ color: '#aaa' }}>{sites.length === 0 ? 'No sites yet. Tap the pin button to add your sites.' : baseEmps.length === 0 ? 'Nobody is on this site yet. Tap the pin button, then the people icon next to the site.' : 'No employees match these filters.'}</Text>
            </View>
          ) : rows.map((e, i) => {
            const mine = assign[e.id] ?? [];
            const unitText = mine.length === 0 ? '' : sites.length > 1 && mine.length === sites.length ? 'All sites' : mine.map(id => siteById[id]?.name).filter(Boolean).join(', ');
            return (
              <View key={e.id} style={{ flexDirection: 'row', height: ROW_H, backgroundColor: '#000', marginBottom: 1 }}>
                <View style={[{ flexDirection: 'row', height: ROW_H, backgroundColor: '#000' }, sticky(0, null, 10)]}>
                  <View style={[styles.rCell, { width: NO_W, backgroundColor: XL.headerGrey, borderRightWidth: 2 }]}>
                    <Text style={styles.rText}>{i + 1}</Text>
                  </View>
                  <View style={[styles.rCell, { width: NAME_W, backgroundColor: XL.nameGreen, borderRightWidth: 2, alignItems: 'flex-start', paddingLeft: 6 }]}>
                    <Text style={[styles.rText, { fontSize: 16 }]} numberOfLines={1}>{e.full_name ?? 'Unnamed'}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setUnitFor(e.id)}
                  style={[styles.rCell, { width: UNIT_W, backgroundColor: XL.cellGrey }]}
                >
                  <Text style={[styles.rText, { fontSize: 13 }]} numberOfLines={1}>{unitText}</Text>
                </TouchableOpacity>
                {cols.map(c => {
                  const d = cell[`${e.id}|${c.id}`];
                  const st = statusOf(d, c);
                  return (
                    <View key={c.id} style={{ flexDirection: 'row' }}>
                      <View style={{ width: GUT_W, backgroundColor: '#000' }} />
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => openCell(e.id, c)}
                        style={{ flexDirection: 'row', height: ROW_H }}
                      >
                        <View style={[styles.rCell, { width: DATE_W, backgroundColor: st ? XL.cellGrey : XL.emptyGrey, borderRightWidth: 1 }]}>
                          <Text style={styles.rText}>{fmt(d?.document_date ?? null)}</Text>
                        </View>
                        <View style={[styles.rCell, { width: STAT_W, backgroundColor: !st ? XL.emptyGrey : st.kind === 'valid' ? XL.valid : st.kind === 'soon' ? XL.soon : XL.expired }]}>
                          <Text style={[styles.rText, { fontSize: 16, color: st && st.kind !== 'valid' ? '#fff' : '#000' }]}>{st ? st.shown : ''}</Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                })}
                <View style={{ width: GUT_W, backgroundColor: '#000' }} />
              </View>
            );
          })}
        </MatrixScroller>
      )}

      {unitFor && (
        <EmployeeSitesModal
          emp={emps.find(e => e.id === unitFor)} sites={sites} selected={assign[unitFor] ?? []} theme={theme}
          onClose={() => setUnitFor(null)} onSave={(ids: string[]) => saveEmployeeSites(unitFor, ids)}
        />
      )}

      {rec && (
        <RecordModal
          key={`${rec.mode}-${rec.doc?.id ?? rec.employeeId}-${rec.colId}`}
          rec={rec} emps={baseEmps} cols={cols} theme={theme} isDark={isDark} insetsTop={insets.top}
          onClose={() => setRec(null)}
          onSaved={() => { setRec(null); load(); }}
        />
      )}
      {showSites && (
        <SitesModal sites={sites} counts={counts} theme={theme} insetsTop={insets.top}
          onClose={() => setShowSites(false)} onChanged={load} onAssign={(site: Site) => setSiteEmpsFor(site)} />
      )}
      {siteEmpsFor && (
        <SiteEmployeesModal
          site={siteEmpsFor} emps={emps} theme={theme} insetsTop={insets.top}
          memberIds={emps.filter(e => (assign[e.id] ?? []).includes(siteEmpsFor.id)).map(e => e.id)}
          onClose={() => setSiteEmpsFor(null)} onChanged={load}
        />
      )}
      {showTypes && (
        <TrainingsModal cols={cols} siteId={activeSite} siteName={activeSiteObj?.name ?? ''} theme={theme} insetsTop={insets.top}
          onClose={() => setShowTypes(false)} onChanged={load} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  addBtn: { backgroundColor: colors.yellow, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  smallBtn: { backgroundColor: colors.yellow, width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  textInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, minHeight: 48 },
  ddBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 48, gap: 8 },
  ddList: { borderWidth: 1, borderRadius: 12, marginTop: 6, overflow: 'hidden' },
  ddItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, gap: 8 },
  fileBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 48, marginBottom: 22 },
  saveBtn: { backgroundColor: colors.yellow, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { width: '100%', maxWidth: 420, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  hCell: { backgroundColor: XL.headerGrey, alignItems: 'center', justifyContent: 'center', borderColor: '#000' },
  hBold: { fontSize: 15, fontWeight: '800', color: '#000', textAlign: 'center' },
  rCell: { height: ROW_H, alignItems: 'center', justifyContent: 'center', borderColor: '#000', paddingHorizontal: 4 },
  rText: { fontSize: 15, color: '#000' },
});
