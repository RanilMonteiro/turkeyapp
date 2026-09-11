import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator, Modal, TextInput, useWindowDimensions
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, User, ChevronDown, ChevronLeft, ChevronRight, X, Trash2, Phone, MessageSquare } from 'lucide-react-native';
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
const DAY_HEADER_BG = '#1e293b';

const TESTING_TYPE_OPTIONS = ['Brake Testing', 'Lux Testing', 'Brake and Lux Testing', 'Inspections'];
const TAM_STATUS_OPTIONS = ['On TAM', 'Not On TAM', 'Brake and Inspection'];
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

function toDateString(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

// Builds a Sun-Sat grid of week rows for the given month, padding the
// leading/trailing gaps with null so every row has exactly 7 slots —
// mirrors how the spreadsheet lays a month out across fixed columns.
function buildMonthGrid(year: number, month: number): (string | null)[][] {
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toDateString(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export default function OperationalCalendar() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const { width } = useWindowDimensions();

  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);

  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string | null>(null);
  const [showTechDropdown, setShowTechDropdown] = useState(false);

  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // Day detail modal (tap a filled day — shows everything including
  // comments, plus Edit/Delete if permitted)
  const [detailEntry, setDetailEntry] = useState<CalendarEntry | null>(null);
  const [detailDate, setDetailDate] = useState<string | null>(null);

  // Entry edit modal
  const [entryModalVisible, setEntryModalVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CalendarEntry | null>(null);
  const [editingDate, setEditingDate] = useState<string | null>(null);
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

  // Cell width: full available width split 7 ways, so the grid always
  // fills the screen edge-to-edge like the spreadsheet's fixed columns.
  const cellWidth = (width - 4) / 7;

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

  const entriesByDate: Record<string, CalendarEntry> = {};
  entries.forEach(e => { entriesByDate[e.entry_date] = e; });

  const selectedTechnician = technicians.find(t => t.id === selectedTechnicianId);
  const weeks = buildMonthGrid(viewDate.year, viewDate.month);

  function goToPreviousMonth() {
    setViewDate(prev => (prev.month === 0 ? { year: prev.year - 1, month: 11 } : { year: prev.year, month: prev.month - 1 }));
  }
  function goToNextMonth() {
    setViewDate(prev => (prev.month === 11 ? { year: prev.year + 1, month: 0 } : { year: prev.year, month: prev.month + 1 }));
  }

  function handleDayPress(dateStr: string) {
    const entry = entriesByDate[dateStr];
    if (entry) {
      setDetailEntry(entry);
      setDetailDate(dateStr);
    } else if (canEdit) {
      openNewEntryModal(dateStr);
    }
  }

  // ---------- Entry modal ----------

  function openNewEntryModal(dateStr: string) {
    setEditingEntry(null);
    setEditingDate(dateStr);
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
    setEditingDate(entry.entry_date);
    setMineName(entry.mine_name);
    setContactPerson(entry.contact_person ?? '');
    setContactNumber(entry.contact_number ?? '');
    setComments(entry.comments ?? '');
    setTestingType(entry.testing_type);
    setTamStatus(entry.tam_status);
    setInvoiceNumber(entry.invoice_number ?? '');
    setDetailEntry(null);
    setEntryModalVisible(true);
  }

  async function handleSaveEntry() {
    if (!mineName.trim()) {
      notify('Missing mine name', 'Please enter a mine name.');
      return;
    }
    if (!editingDate || !selectedTechnicianId) return;

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();

    const payload = {
      technician_id: selectedTechnicianId,
      entry_date: editingDate,
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
          setDetailEntry(null);
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
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft color={colors.yellow} size={24} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Operational Calendar</Text>
          <View style={{ width: 24 }} />
        </View>

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
          <Text style={[styles.readOnlyNote, { color: theme.muted }]}>View only</Text>
        )}

        {/* Month nav */}
        <View style={styles.monthNavRow}>
          <TouchableOpacity onPress={goToPreviousMonth} style={styles.monthNavBtn}>
            <ChevronLeft color={colors.yellow} size={22} />
          </TouchableOpacity>
          <Text style={[styles.monthNavLabel, { color: theme.text }]}>
            {new Date(viewDate.year, viewDate.month, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}
          </Text>
          <TouchableOpacity onPress={goToNextMonth} style={styles.monthNavBtn}>
            <ChevronRight color={colors.yellow} size={22} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {/* Weekday header row */}
          <View style={styles.weekRow}>
            {WEEKDAY_LABELS.map(label => (
              <View key={label} style={[styles.weekdayHeaderCell, { width: cellWidth, backgroundColor: DAY_HEADER_BG }]}>
                <Text style={styles.weekdayHeaderText}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Grid */}
          {weeks.map((week, wi) => (
            <View key={wi} style={styles.weekRow}>
              {week.map((dateStr, di) => {
                if (!dateStr) {
                  return <View key={di} style={[styles.dayCell, { width: cellWidth, backgroundColor: theme.background, borderColor: theme.border }]} />;
                }
                const entry = entriesByDate[dateStr];
                const dayNum = parseInt(dateStr.split('-')[2], 10);
                return (
                  <TouchableOpacity
                    key={di}
                    style={[styles.dayCell, { width: cellWidth, backgroundColor: theme.card, borderColor: theme.border }]}
                    onPress={() => handleDayPress(dateStr)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dayNumber, { color: theme.text }]}>{dayNum}</Text>

                    {entry && (
                      <View style={styles.dayCellContent}>
                        <Text style={[styles.cellMineName, { color: theme.text }]} numberOfLines={2}>
                          {entry.mine_name}
                        </Text>
                        {entry.contact_person && (
                          <Text style={[styles.cellSubText, { color: theme.subtext }]} numberOfLines={1}>
                            {entry.contact_person}
                          </Text>
                        )}
                        {entry.contact_number && (
                          <Text style={[styles.cellSubText, { color: theme.subtext }]} numberOfLines={1}>
                            {entry.contact_number}
                          </Text>
                        )}
                        {entry.testing_type && (
                          <View style={[styles.cellPill, { backgroundColor: TESTING_TYPE_COLOR.bg }]}>
                            <Text style={[styles.cellPillText, { color: TESTING_TYPE_COLOR.text }]} numberOfLines={1}>
                              {entry.testing_type}
                            </Text>
                          </View>
                        )}
                        {entry.tam_status && (
                          <View style={[styles.cellPill, { backgroundColor: TAM_STATUS_COLOR.bg }]}>
                            <Text style={[styles.cellPillText, { color: TAM_STATUS_COLOR.text }]} numberOfLines={1}>
                              {entry.tam_status}
                            </Text>
                          </View>
                        )}
                        {entry.invoice_number && (
                          <Text style={styles.cellInvoiceText} numberOfLines={1}>
                            {entry.invoice_number}
                          </Text>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>

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
                  onPress={() => { setSelectedTechnicianId(t.id); setShowTechDropdown(false); }}
                >
                  <Text style={[styles.dropdownItemText, { color: selectedTechnicianId === t.id ? colors.yellow : theme.text }]}>{t.full_name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Day detail modal — tapping a filled day shows everything,
          including comments, which don't fit in the grid cell itself */}
      <Modal visible={!!detailEntry} transparent animationType="fade" onRequestClose={() => setDetailEntry(null)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setDetailEntry(null)}>
          <TouchableOpacity activeOpacity={1} style={[styles.detailSheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {detailEntry && (
              <>
                <View style={styles.detailHeaderRow}>
                  <Text style={[styles.detailDate, { color: theme.subtext }]}>
                    {detailDate ? new Date(detailDate + 'T00:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
                  </Text>
                  <TouchableOpacity onPress={() => setDetailEntry(null)}>
                    <X color={theme.muted} size={20} />
                  </TouchableOpacity>
                </View>

                <Text style={[styles.mineName, { color: theme.text }]}>{detailEntry.mine_name}</Text>

                {(detailEntry.contact_person || detailEntry.contact_number) && (
                  <View style={styles.metaRow}>
                    {detailEntry.contact_person && (
                      <View style={styles.metaItem}>
                        <User color={theme.subtext} size={13} />
                        <Text style={[styles.metaText, { color: theme.subtext }]}>{detailEntry.contact_person}</Text>
                      </View>
                    )}
                    {detailEntry.contact_number && (
                      <View style={styles.metaItem}>
                        <Phone color={theme.subtext} size={13} />
                        <Text style={[styles.metaText, { color: theme.subtext }]}>{detailEntry.contact_number}</Text>
                      </View>
                    )}
                  </View>
                )}

                {detailEntry.comments && (
                  <View style={[styles.metaItem, { marginTop: 6, alignItems: 'flex-start' }]}>
                    <MessageSquare color={theme.subtext} size={13} />
                    <Text style={[styles.metaText, { color: theme.subtext, flex: 1 }]}>{detailEntry.comments}</Text>
                  </View>
                )}

                <View style={styles.pillRow}>
                  {detailEntry.testing_type && (
                    <View style={[styles.pill, { backgroundColor: TESTING_TYPE_COLOR.bg }]}>
                      <Text style={[styles.pillText, { color: TESTING_TYPE_COLOR.text }]}>{detailEntry.testing_type}</Text>
                    </View>
                  )}
                  {detailEntry.tam_status && (
                    <View style={[styles.pill, { backgroundColor: TAM_STATUS_COLOR.bg }]}>
                      <Text style={[styles.pillText, { color: TAM_STATUS_COLOR.text }]}>{detailEntry.tam_status}</Text>
                    </View>
                  )}
                </View>

                {detailEntry.invoice_number && (
                  <Text style={styles.invoiceText}>{detailEntry.invoice_number}</Text>
                )}

                {canEdit && (
                  <View style={styles.entryActionsRow}>
                    <TouchableOpacity onPress={() => openEditEntryModal(detailEntry)}>
                      <Text style={{ color: colors.yellow, fontWeight: '700', fontSize: 13 }}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteEntry(detailEntry)}>
                      <Trash2 color="#ef4444" size={16} />
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </TouchableOpacity>
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
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  techPicker: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 46,
    marginHorizontal: 16, marginBottom: 8,
  },
  techPickerText: { flex: 1, fontSize: 14, fontWeight: '600' },
  readOnlyNote: { fontSize: 12, fontStyle: 'italic', marginHorizontal: 16, marginBottom: 6 },
  monthNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, paddingVertical: 8 },
  monthNavBtn: { padding: 8 },
  monthNavLabel: { fontSize: 16, fontWeight: '700', minWidth: 160, textAlign: 'center' },
  weekRow: { flexDirection: 'row' },
  weekdayHeaderCell: { paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  weekdayHeaderText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  dayCell: {
    minHeight: 110, borderWidth: 0.5, padding: 4,
  },
  dayCellContent: { marginTop: 2, gap: 2 },
  dayNumber: { fontSize: 11, fontWeight: '700' },
  cellMineName: { fontSize: 9, fontWeight: '700', lineHeight: 11 },
  cellSubText: { fontSize: 7.5, lineHeight: 9 },
  cellPill: { borderRadius: 6, paddingHorizontal: 3, paddingVertical: 1, marginTop: 2 },
  cellPillText: { fontSize: 7, fontWeight: '700', textAlign: 'center' },
  cellInvoiceText: { fontSize: 7, fontWeight: '700', color: INVOICE_COLOR, marginTop: 2 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  pickerSheet: { width: '100%', maxWidth: 420, borderRadius: 16, borderWidth: 1, padding: 16 },
  pickerTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  dropdownItem: { padding: 14, borderBottomWidth: 1 },
  dropdownItemText: { fontSize: 15 },
  detailSheet: { width: '100%', maxWidth: 420, borderRadius: 16, borderWidth: 1, padding: 20 },
  detailHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  detailDate: { fontSize: 13, fontWeight: '600' },
  mineName: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 13 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  pillText: { fontSize: 12, fontWeight: '700' },
  invoiceText: { fontSize: 13, fontWeight: '700', color: INVOICE_COLOR },
  entryActionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
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