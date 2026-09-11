import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator, Modal, TextInput
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, User, ChevronDown, X, Plus, Trash2, MapPin, Phone, MessageSquare, Hash } from 'lucide-react-native';
import { Calendar } from 'react-native-calendars';
import { supabase } from '../../../lib/supabase';
import { notify, confirm } from '../../../lib/notify';
import { useFocusEffect } from '@react-navigation/native';

const colors = {
  yellow: '#fbbf24',
  white: '#ffffff',
  black: '#000000',
  gray: {
    50: '#f8fafc', 200: '#e2e8f0', 400: '#94a3b8',
    500: '#64748b', 700: '#334155', 800: '#1e293b', 900: '#0f172a',
  }
};

// Matches the green / tan / red color coding from the spreadsheet.
const TESTING_TYPE_COLOR = { bg: '#d1fae5', text: '#059669' };
const TAM_STATUS_COLOR = { bg: '#fef3c7', text: '#b45309' };
const INVOICE_COLOR = '#dc2626';

const TESTING_TYPE_OPTIONS = ['Brake Testing', 'Lux Testing', 'Brake and Lux Testing', 'Inspections'];
const TAM_STATUS_OPTIONS = ['On TAM', 'Not On TAM', 'Brake and Inspection'];

type Technician = { id: string; full_name: string };

type CalendarEntry = {
  id: string;
  technician_id: string;
  entry_date: string;
  mine_name: string;
  contact_person: string | null;
  contact_number: string | null;
  comments: string | null;
  testing_type: string | null;
  tam_status: string | null;
  invoice_number: string | null;
};

export default function OperationalCalendar() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';

  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);

  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string | null>(null);
  const [showTechDropdown, setShowTechDropdown] = useState(false);

  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Entry edit modal
  const [entryModalVisible, setEntryModalVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CalendarEntry | null>(null);
  const [mineName, setMineName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [comments, setComments] = useState('');
  const [testingType, setTestingType] = useState<string | null>(null);
  const [tamStatus, setTamStatus] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [showTestingTypeDropdown, setShowTestingTypeDropdown] = useState(false);
  const [showTamStatusDropdown, setShowTamStatusDropdown] = useState(false);
  const [saving, setSaving] = useState(false);

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    input: isDark ? colors.gray[800] : colors.gray[50],
    text: isDark ? colors.white : '#1e293b',
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    muted: isDark ? colors.gray[500] : colors.gray[400],
  };

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [])
  );

  async function fetchAll() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    setUserId(uid);

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', uid)
      .single();
    const myRole = profile?.role ?? null;
    setRole(myRole);

    // Who can edit: superuser/hr always; admin only if explicitly
    // granted via operational_calendar_permissions; technicians never.
    let editable = false;
    if (myRole === 'superuser' || myRole === 'hr') {
      editable = true;
    } else if (myRole === 'admin') {
      const { data: grant } = await supabase
        .from('user_permissions')
        .select('granted')
        .eq('user_id', uid)
        .eq('permission', 'can_edit_operational_calendar')
        .maybeSingle();
      editable = !!grant?.granted;
    }
    setCanEdit(editable);

    // Technician list: technicians only ever see themselves. Everyone
    // else (with view or edit rights) can browse all technicians.
    if (myRole === 'technician') {
      setSelectedTechnicianId(uid);
      const { data: me } = await supabase.from('profiles').select('id, full_name').eq('id', uid).single();
      if (me) setTechnicians([me]);
    } else {
      const { data: techs } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'technician')
        .order('full_name');
      if (techs) setTechnicians(techs);
      setSelectedTechnicianId(prev => prev ?? techs?.[0]?.id ?? null);
    }

    setLoading(false);
  }

  useFocusEffect(
    useCallback(() => {
      if (selectedTechnicianId) fetchEntries(selectedTechnicianId);
    }, [selectedTechnicianId])
  );

  async function fetchEntries(technicianId: string) {
    const { data } = await supabase
      .from('operational_calendar_entries')
      .select('*')
      .eq('technician_id', technicianId)
      .order('entry_date');
    if (data) setEntries(data);
  }

  const markedDates: Record<string, any> = {};
  entries.forEach(entry => {
    markedDates[entry.entry_date] = {
      marked: true,
      dotColor: colors.yellow,
    };
  });
  if (selectedDate) {
    markedDates[selectedDate] = {
      ...(markedDates[selectedDate] ?? {}),
      selected: true,
      selectedColor: `${colors.yellow}40`,
    };
  }

  const entryForSelectedDate = selectedDate
    ? entries.find(e => e.entry_date === selectedDate) ?? null
    : null;

  const selectedTechnician = technicians.find(t => t.id === selectedTechnicianId);

  // ---------- Entry modal ----------

  function openNewEntryModal() {
    if (!selectedDate) return;
    setEditingEntry(null);
    setMineName('');
    setContactPerson('');
    setContactNumber('');
    setComments('');
    setTestingType(null);
    setTamStatus(null);
    setInvoiceNumber('');
    setEntryModalVisible(true);
  }

  function openEditEntryModal(entry: CalendarEntry) {
    setEditingEntry(entry);
    setMineName(entry.mine_name);
    setContactPerson(entry.contact_person ?? '');
    setContactNumber(entry.contact_number ?? '');
    setComments(entry.comments ?? '');
    setTestingType(entry.testing_type);
    setTamStatus(entry.tam_status);
    setInvoiceNumber(entry.invoice_number ?? '');
    setEntryModalVisible(true);
  }

  async function handleSaveEntry() {
    if (!mineName.trim()) {
      notify('Missing mine name', 'Please enter a mine name.');
      return;
    }
    if (!selectedDate || !selectedTechnicianId) return;

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();

    const payload = {
      technician_id: selectedTechnicianId,
      entry_date: selectedDate,
      mine_name: mineName.trim(),
      contact_person: contactPerson.trim() || null,
      contact_number: contactNumber.trim() || null,
      comments: comments.trim() || null,
      testing_type: testingType,
      tam_status: tamStatus,
      invoice_number: invoiceNumber.trim() || null,
      updated_by: userData.user?.id,
    };

    const { error } = editingEntry
      ? await supabase.from('operational_calendar_entries').update(payload).eq('id', editingEntry.id)
      : await supabase.from('operational_calendar_entries').insert({ ...payload, created_by: userData.user?.id });

    setSaving(false);

    if (error) {
      notify('Error', error.message);
      return;
    }

    setEntryModalVisible(false);
    fetchEntries(selectedTechnicianId);
  }

  function handleDeleteEntry(entry: CalendarEntry) {
    confirm(
      'Delete Entry',
      `Delete the entry for "${entry.mine_name}" on ${entry.entry_date}?`,
      async () => {
        const { error } = await supabase.from('operational_calendar_entries').delete().eq('id', entry.id);
        if (error) {
          notify('Error', error.message);
        } else if (selectedTechnicianId) {
          fetchEntries(selectedTechnicianId);
        }
      }
    );
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }

  return (
    <>
      <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft color={colors.yellow} size={24} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Operational Calendar</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Technician picker — hidden for technicians, who only see their own */}
        {role !== 'technician' && (
          <TouchableOpacity
            style={[styles.techPicker, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => setShowTechDropdown(true)}
          >
            <User color={colors.yellow} size={16} />
            <Text style={[styles.techPickerText, { color: theme.text }]}>
              {selectedTechnician?.full_name ?? 'Select technician'}
            </Text>
            <ChevronDown color={theme.muted} size={16} />
          </TouchableOpacity>
        )}

        {!canEdit && (
          <Text style={[styles.readOnlyNote, { color: theme.muted }]}>
            View only — you don't have permission to edit this calendar.
          </Text>
        )}

        {/* Calendar */}
        <View style={[styles.calendarCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Calendar
            markedDates={markedDates}
            onDayPress={(day) => setSelectedDate(day.dateString)}
            theme={{
              calendarBackground: theme.card,
              dayTextColor: theme.text,
              monthTextColor: theme.text,
              textDisabledColor: theme.muted,
              todayTextColor: colors.yellow,
              arrowColor: colors.yellow,
            }}
          />
        </View>

        {/* Selected day details */}
        {selectedDate && (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.dayCardHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
              {canEdit && !entryForSelectedDate && (
                <TouchableOpacity style={styles.smallAddBtn} onPress={openNewEntryModal}>
                  <Plus color={colors.black} size={16} />
                </TouchableOpacity>
              )}
            </View>

            {!entryForSelectedDate ? (
              <Text style={[styles.emptyText, { color: theme.muted }]}>No entry for this day.</Text>
            ) : (
              <View>
                <Text style={[styles.mineName, { color: theme.text }]}>{entryForSelectedDate.mine_name}</Text>

                {(entryForSelectedDate.contact_person || entryForSelectedDate.contact_number) && (
                  <View style={styles.metaRow}>
                    {entryForSelectedDate.contact_person && (
                      <View style={styles.metaItem}>
                        <User color={theme.subtext} size={13} />
                        <Text style={[styles.metaText, { color: theme.subtext }]}>{entryForSelectedDate.contact_person}</Text>
                      </View>
                    )}
                    {entryForSelectedDate.contact_number && (
                      <View style={styles.metaItem}>
                        <Phone color={theme.subtext} size={13} />
                        <Text style={[styles.metaText, { color: theme.subtext }]}>{entryForSelectedDate.contact_number}</Text>
                      </View>
                    )}
                  </View>
                )}

                {entryForSelectedDate.comments && (
                  <View style={[styles.metaItem, { marginTop: 6 }]}>
                    <MessageSquare color={theme.subtext} size={13} />
                    <Text style={[styles.metaText, { color: theme.subtext, flex: 1 }]}>{entryForSelectedDate.comments}</Text>
                  </View>
                )}

                <View style={styles.pillRow}>
                  {entryForSelectedDate.testing_type && (
                    <View style={[styles.pill, { backgroundColor: TESTING_TYPE_COLOR.bg }]}>
                      <Text style={[styles.pillText, { color: TESTING_TYPE_COLOR.text }]}>{entryForSelectedDate.testing_type}</Text>
                    </View>
                  )}
                  {entryForSelectedDate.tam_status && (
                    <View style={[styles.pill, { backgroundColor: TAM_STATUS_COLOR.bg }]}>
                      <Text style={[styles.pillText, { color: TAM_STATUS_COLOR.text }]}>{entryForSelectedDate.tam_status}</Text>
                    </View>
                  )}
                </View>

                {entryForSelectedDate.invoice_number && (
                  <View style={styles.metaItem}>
                    <Hash color={INVOICE_COLOR} size={13} />
                    <Text style={[styles.invoiceText]}>{entryForSelectedDate.invoice_number}</Text>
                  </View>
                )}

                {canEdit && (
                  <View style={styles.entryActionsRow}>
                    <TouchableOpacity onPress={() => openEditEntryModal(entryForSelectedDate)}>
                      <Text style={{ color: colors.yellow, fontWeight: '700', fontSize: 13 }}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteEntry(entryForSelectedDate)}>
                      <Trash2 color="#ef4444" size={16} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Technician picker modal */}
      <Modal visible={showTechDropdown} transparent animationType="fade" onRequestClose={() => setShowTechDropdown(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowTechDropdown(false)}>
          <View style={[styles.pickerSheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.pickerTitle, { color: theme.text }]}>Select Technician</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {technicians.map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.dropdownItem, { borderBottomColor: theme.border }, selectedTechnicianId === t.id && { backgroundColor: `${colors.yellow}20` }]}
                  onPress={() => { setSelectedTechnicianId(t.id); setSelectedDate(null); setShowTechDropdown(false); }}
                >
                  <Text style={[styles.dropdownItemText, { color: selectedTechnicianId === t.id ? colors.yellow : theme.text }]}>{t.full_name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Entry edit modal */}
      <Modal visible={entryModalVisible} animationType="slide" transparent={false} onRequestClose={() => setEntryModalVisible(false)}>
        <ScrollView
          style={[styles.modalContainer, { backgroundColor: theme.background }]}
          contentContainerStyle={styles.modalContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setEntryModalVisible(false)}>
              <X color={theme.muted} size={24} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {editingEntry ? 'Edit Entry' : 'New Entry'}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>MINE NAME *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                placeholder="e.g. Redpath Mining"
                placeholderTextColor={theme.muted}
                value={mineName}
                onChangeText={setMineName}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>CONTACT PERSON/PEOPLE</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                placeholder="e.g. Renier/Doug"
                placeholderTextColor={theme.muted}
                value={contactPerson}
                onChangeText={setContactPerson}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>CONTACT NUMBER/NUMBERS</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                placeholder="e.g. 071-873-4617/082-448-5069"
                placeholderTextColor={theme.muted}
                value={contactNumber}
                onChangeText={setContactNumber}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>COMMENTS</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text, height: 80, textAlignVertical: 'top' }]}
                placeholder="e.g. Night Shift, No Retest Done..."
                placeholderTextColor={theme.muted}
                value={comments}
                onChangeText={setComments}
                multiline
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>TESTING TYPE</Text>
              <TouchableOpacity
                style={[styles.dropdownBtn, { backgroundColor: theme.input, borderColor: theme.border }]}
                onPress={() => setShowTestingTypeDropdown(!showTestingTypeDropdown)}
              >
                <Text style={[styles.dropdownBtnText, { color: testingType ? theme.text : theme.subtext }]}>
                  {testingType ?? 'Select testing type'}
                </Text>
                <ChevronDown color={theme.muted} size={16} />
              </TouchableOpacity>
              {showTestingTypeDropdown && (
                <View style={[styles.dropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  {TESTING_TYPE_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.dropdownItem, { borderBottomColor: theme.border }, testingType === opt && { backgroundColor: `${colors.yellow}20` }]}
                      onPress={() => { setTestingType(opt); setShowTestingTypeDropdown(false); }}
                    >
                      <Text style={[styles.dropdownItemText, { color: testingType === opt ? colors.yellow : theme.text }]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>TAM STATUS</Text>
              <TouchableOpacity
                style={[styles.dropdownBtn, { backgroundColor: theme.input, borderColor: theme.border }]}
                onPress={() => setShowTamStatusDropdown(!showTamStatusDropdown)}
              >
                <Text style={[styles.dropdownBtnText, { color: tamStatus ? theme.text : theme.subtext }]}>
                  {tamStatus ?? 'Select TAM status'}
                </Text>
                <ChevronDown color={theme.muted} size={16} />
              </TouchableOpacity>
              {showTamStatusDropdown && (
                <View style={[styles.dropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  {TAM_STATUS_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.dropdownItem, { borderBottomColor: theme.border }, tamStatus === opt && { backgroundColor: `${colors.yellow}20` }]}
                      onPress={() => { setTamStatus(opt); setShowTamStatusDropdown(false); }}
                    >
                      <Text style={[styles.dropdownItemText, { color: tamStatus === opt ? colors.yellow : theme.text }]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>INVOICE NUMBER</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                placeholder="e.g. SO 16617 INV 50521"
                placeholderTextColor={theme.muted}
                value={invoiceNumber}
                onChangeText={setInvoiceNumber}
              />
            </View>
          </View>

          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSaveEntry} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.black} /> : <Text style={styles.saveBtnText}>Save Entry</Text>}
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingBottom: 48 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  techPicker: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 46,
    marginHorizontal: 16, marginBottom: 10,
  },
  techPickerText: { flex: 1, fontSize: 14, fontWeight: '600' },
  readOnlyNote: { fontSize: 12, fontStyle: 'italic', marginHorizontal: 16, marginBottom: 10 },
  calendarCard: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
  card: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, padding: 16 },
  dayCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  emptyText: { fontSize: 13, fontStyle: 'italic' },
  smallAddBtn: {
    backgroundColor: colors.yellow, width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  mineName: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 13 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  pillText: { fontSize: 12, fontWeight: '700' },
  invoiceText: { fontSize: 13, fontWeight: '700', color: INVOICE_COLOR },
  entryActionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  pickerSheet: { width: '100%', maxWidth: 420, borderRadius: 16, borderWidth: 1, padding: 16 },
  pickerTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  dropdownItem: { padding: 14, borderBottomWidth: 1 },
  dropdownItemText: { fontSize: 15 },
  modalContainer: { flex: 1 },
  modalContent: { paddingBottom: 48 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  formCard: { margin: 16, borderRadius: 20, padding: 20, borderWidth: 1 },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  dropdownBtn: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderRadius: 12, paddingHorizontal: 14, height: 52, gap: 10,
  },
  dropdownBtnText: { flex: 1, fontSize: 15 },
  dropdown: { borderWidth: 1, borderRadius: 12, marginTop: 4, overflow: 'hidden' },
  saveBtn: {
    backgroundColor: colors.yellow, borderRadius: 14, height: 56,
    alignItems: 'center', justifyContent: 'center', margin: 16,
  },
  saveBtnText: { color: colors.black, fontSize: 16, fontWeight: '700' },
});