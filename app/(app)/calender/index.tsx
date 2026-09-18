import { useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator, Modal, TextInput, useWindowDimensions,
  PanResponder, GestureResponderEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, User, ChevronDown, ChevronLeft, ChevronRight, X, Trash2, Phone, MessageSquare } from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';
import { notify, confirm } from '../../../lib/notify';
import { useFocusEffect } from '@react-navigation/native';
import DatePickerField from '../../../components/DatepickerField';

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

// Fixed colors for the calendar grid itself — these are intentionally NOT
// theme-aware, so the calendar always looks the same (white/green) whether
// the app is in light or dark mode, matching the reference spreadsheet.
const CELL_EMPTY_BG = '#ffffff';
const CELL_FILLED_BG = '#d9ead3';
const CELL_BORDER = '#94a3b8';
const CELL_TEXT_DARK = '#0f172a';
const CELL_SUBTEXT_DARK = '#334155';
const COMMENT_BG = '#fff176';
const COMMENT_BORDER = '#000000';
const DRAG_FILL_BORDER = '#2563eb';
const DRAG_FILL_TINT = 'rgba(37, 99, 235, 0.18)';
const DRAG_DELETE_BORDER = '#dc2626';
const DRAG_DELETE_TINT = 'rgba(220, 38, 38, 0.22)';
const DRAG_SOURCE_BORDER = '#b45309';

const TESTING_TYPE_OPTIONS = ['Brake Testing', 'Lux Testing', 'Brake and Lux Testing', 'Inspections'];
const TAM_STATUS_OPTIONS = ['On TAM', 'Not On TAM', 'Brake and Inspection'];
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Fixed row height for the grid — needed so drag gestures can work out
// which day is under the finger using simple math instead of measuring
// every cell. If you change dayCell's height in the styles below, update
// this too.
const ROW_HEIGHT = 140;

// Whether dragging one day onto others also copies its invoice number.
// Off by default since invoice numbers are usually unique per job.
const COPY_INVOICE_ON_FILL = false;

type Technician = { id: string; full_name: string };

type MinePreset = {
  mine_name: string;
  contact_person: string | null;
  contact_number: string | null;
};

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

type DragInfo =
  | { type: 'fill'; sourceDate: string; dates: string[] }
  | { type: 'delete'; dates: string[] };

function toDateString(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

// Every date string between from/to inclusive — used to spread one
// entry across multiple days when the person sets a date range, and
// to work out which days a fill-drag gesture passed over.
function expandDateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  let current = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function computeRangeDates(a: string, b: string): string[] {
  return a <= b ? expandDateRange(a, b) : expandDateRange(b, a);
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

// The grid cell background only knows "has an entry" vs "empty" right now
// (matches the green look in the reference screenshot). The screenshot
// also shows one manually orange-highlighted mine — there's no field in
// the data that would drive that automatically, so it isn't reproduced
// here. Adding a `highlight_color` column + a color picker in the entry
// form would be the way to support that.
function getCellBackground(entry: CalendarEntry | undefined): string {
  return entry ? CELL_FILLED_BG : CELL_EMPTY_BG;
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
  const [minePresets, setMinePresets] = useState<MinePreset[]>([]);
  const [showMineSuggestions, setShowMineSuggestions] = useState(false);
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
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
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

  // ---------- Drag-to-fill / drag-to-delete ----------
  const [deleteMode, setDeleteMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);

  const gridRef = useRef<View>(null);
  const gridOriginRef = useRef({ pageX: 0, pageY: 0 });
  const dragInfoRef = useRef<DragInfo | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartDateRef = useRef<string | null>(null);

  // Mirrors the latest state into a ref so the PanResponder (created once
  // and never recreated) can always read fresh values instead of the
  // stale ones captured on its first render.
  const liveRef = useRef({
    canEdit: false,
    deleteMode: false,
    weeks: [] as (string | null)[][],
    cellWidth: 0,
    entriesByDate: {} as Record<string, CalendarEntry>,
    selectedTechnicianId: null as string | null,
  });

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
      fetchMinePresets();
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

  async function fetchMinePresets() {
    const { data } = await supabase
      .from('operational_calendar_mine_presets')
      .select('mine_name, contact_person, contact_number')
      .order('mine_name');
    if (data) setMinePresets(data);
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

  // Keep the live ref in sync every render so gesture handlers (bound
  // once) always see current data.
  liveRef.current.canEdit = canEdit;
  liveRef.current.deleteMode = deleteMode;
  liveRef.current.weeks = weeks;
  liveRef.current.cellWidth = cellWidth;
  liveRef.current.entriesByDate = entriesByDate;
  liveRef.current.selectedTechnicianId = selectedTechnicianId;

  function goToPreviousMonth() {
    setViewDate(prev => (prev.month === 0 ? { year: prev.year - 1, month: 11 } : { year: prev.year, month: prev.month - 1 }));
  }
  function goToNextMonth() {
    setViewDate(prev => (prev.month === 11 ? { year: prev.year + 1, month: 0 } : { year: prev.year, month: prev.month + 1 }));
  }

  function handleDayPress(dateStr: string | null) {
    if (!dateStr) return;
    const entry = liveRef.current.entriesByDate[dateStr];
    if (entry) {
      setDetailEntry(entry);
      setDetailDate(dateStr);
    } else if (liveRef.current.canEdit) {
      openNewEntryModal(dateStr);
    }
  }

  // ---------- Drag gesture ----------

  function dateAtTouch(evt: GestureResponderEvent): string | null {
    const { pageX, pageY } = evt.nativeEvent;
    const localX = pageX - gridOriginRef.current.pageX;
    const localY = pageY - gridOriginRef.current.pageY;
    if (localX < 0 || localY < 0) return null;
    const { weeks: liveWeeks, cellWidth: liveCellWidth } = liveRef.current;
    if (!liveCellWidth) return null;
    const col = Math.floor(localX / liveCellWidth);
    const row = Math.floor(localY / ROW_HEIGHT);
    if (col < 0 || col > 6) return null;
    const week = liveWeeks[row];
    if (!week) return null;
    return week[col] ?? null;
  }

  function measureGridOrigin() {
    gridRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
      gridOriginRef.current = { pageX, pageY };
    });
  }

  async function performFillSave(sourceEntry: CalendarEntry, targetDates: string[]) {
    const technicianId = liveRef.current.selectedTechnicianId;
    if (!technicianId) return;
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;

    const rows = targetDates.map(entry_date => ({
      technician_id: technicianId,
      entry_date,
      mine_name: sourceEntry.mine_name,
      contact_person: sourceEntry.contact_person,
      contact_number: sourceEntry.contact_number,
      comments: sourceEntry.comments,
      testing_type: sourceEntry.testing_type,
      tam_status: sourceEntry.tam_status,
      invoice_number: COPY_INVOICE_ON_FILL ? sourceEntry.invoice_number : null,
      updated_by: uid,
      created_by: uid,
    }));

    const { error } = await supabase
      .from('operational_calendar_entries')
      .upsert(rows, { onConflict: 'technician_id,entry_date' });

    setSaving(false);
    if (error) {
      notify('Error', error.message);
      return;
    }
    fetchEntries(technicianId);
  }

  function finishFillDrag(info: Extract<DragInfo, { type: 'fill' }>) {
    const sourceEntry = liveRef.current.entriesByDate[info.sourceDate];
    if (!sourceEntry) return;
    const targetDates = info.dates.filter(d => d !== info.sourceDate);
    if (targetDates.length === 0) return;

    const overlapping = targetDates.filter(d => !!liveRef.current.entriesByDate[d]);
    const apply = () => performFillSave(sourceEntry, targetDates);

    if (overlapping.length > 0) {
      confirm(
        'Overwrite existing entries?',
        `${overlapping.length} day${overlapping.length === 1 ? '' : 's'} in this range already ${overlapping.length === 1 ? 'has' : 'have'} an entry. Filling will replace ${overlapping.length === 1 ? 'it' : 'them'}.`,
        apply
      );
    } else {
      apply();
    }
  }

  async function deleteEntriesForDates(dates: string[]) {
    const ids = dates
      .map(d => liveRef.current.entriesByDate[d]?.id)
      .filter((id): id is string => !!id);
    if (ids.length === 0) return;

    setSaving(true);
    const { error } = await supabase.from('operational_calendar_entries').delete().in('id', ids);
    setSaving(false);

    if (error) {
      notify('Error', error.message);
      return;
    }
    const technicianId = liveRef.current.selectedTechnicianId;
    if (technicianId) fetchEntries(technicianId);
  }

  function finishDeleteDrag(info: Extract<DragInfo, { type: 'delete' }>) {
    const targets = info.dates.filter(d => !!liveRef.current.entriesByDate[d]);
    if (targets.length === 0) return;
    confirm(
      'Delete Entries',
      `Delete ${targets.length} entr${targets.length === 1 ? 'y' : 'ies'}? This can't be undone.`,
      () => deleteEntriesForDates(targets)
    );
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => liveRef.current.canEdit,
      onStartShouldSetPanResponder: () => liveRef.current.canEdit,
      onPanResponderGrant: (evt) => {
        measureGridOrigin();
        const startDate = dateAtTouch(evt);
        touchStartDateRef.current = startDate;

        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = setTimeout(() => {
          if (!startDate) return;
          if (liveRef.current.deleteMode) {
            if (liveRef.current.entriesByDate[startDate]) {
              const info: DragInfo = { type: 'delete', dates: [startDate] };
              dragInfoRef.current = info;
              setDragInfo(info);
              setIsDragging(true);
            }
          } else if (liveRef.current.entriesByDate[startDate]) {
            const info: DragInfo = { type: 'fill', sourceDate: startDate, dates: [startDate] };
            dragInfoRef.current = info;
            setDragInfo(info);
            setIsDragging(true);
          }
        }, 350);
      },
      onPanResponderMove: (evt) => {
        if (!dragInfoRef.current) return;
        const dateStr = dateAtTouch(evt);
        if (!dateStr) return;
        const current = dragInfoRef.current;

        if (current.type === 'fill') {
          const dates = computeRangeDates(current.sourceDate, dateStr);
          const next: DragInfo = { ...current, dates };
          dragInfoRef.current = next;
          setDragInfo(next);
        } else {
          if (!current.dates.includes(dateStr) && liveRef.current.entriesByDate[dateStr]) {
            const next: DragInfo = { ...current, dates: [...current.dates, dateStr] };
            dragInfoRef.current = next;
            setDragInfo(next);
          }
        }
      },
      onPanResponderRelease: () => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        const info = dragInfoRef.current;
        dragInfoRef.current = null;
        setDragInfo(null);
        setIsDragging(false);

        if (info) {
          if (info.type === 'fill') finishFillDrag(info);
          else finishDeleteDrag(info);
        } else if (touchStartDateRef.current) {
          handleDayPress(touchStartDateRef.current);
        }
        touchStartDateRef.current = null;
      },
      onPanResponderTerminate: () => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        dragInfoRef.current = null;
        setDragInfo(null);
        setIsDragging(false);
        touchStartDateRef.current = null;
      },
    })
  ).current;

  // ---------- Entry modal ----------

  function openNewEntryModal(dateStr: string) {
    setEditingEntry(null);
    setDateFrom(dateStr);
    setDateTo(dateStr);
    setMineName('');
    setContactPerson('');
    setContactNumber('');
    setComments('');
    setTestingType(null);
    setTamStatus(null);
    setInvoiceNumber('');
    setShowMineSuggestions(false);
    setEntryModalVisible(true);
  }

  function openEditEntryModal(entry: CalendarEntry) {
    setEditingEntry(entry);
    setDateFrom(entry.entry_date);
    setDateTo(entry.entry_date);
    setMineName(entry.mine_name);
    setContactPerson(entry.contact_person ?? '');
    setContactNumber(entry.contact_number ?? '');
    setComments(entry.comments ?? '');
    setTestingType(entry.testing_type);
    setTamStatus(entry.tam_status);
    setInvoiceNumber(entry.invoice_number ?? '');
    setShowMineSuggestions(false);
    setDetailEntry(null);
    setEntryModalVisible(true);
  }

  const filteredMineSuggestions = mineName.trim().length > 0
    ? minePresets.filter(p => p.mine_name.toLowerCase().includes(mineName.trim().toLowerCase())).slice(0, 6)
    : [];

  function selectMinePreset(preset: MinePreset) {
    setMineName(preset.mine_name);
    setContactPerson(preset.contact_person ?? '');
    setContactNumber(preset.contact_number ?? '');
    setShowMineSuggestions(false);
  }

  async function handleSaveEntry() {
    if (!mineName.trim()) {
      notify('Missing mine name', 'Please enter a mine name.');
      return;
    }
    if (!dateFrom || !selectedTechnicianId) return;

    if (!editingEntry && dateTo < dateFrom) {
      notify('Invalid range', '"Date To" can\'t be before "Date From".');
      return;
    }

    const targetDates = editingEntry ? [dateFrom] : expandDateRange(dateFrom, dateTo);

    // Warn before silently overwriting days that already have an
    // entry — only relevant for a fresh multi/single-day save (this
    // branch only runs when editingEntry is null, so any existing
    // entry on a target day is necessarily a different one).
    const overlapping = editingEntry
      ? []
      : targetDates.filter(d => !!entriesByDate[d]);

    if (overlapping.length > 0) {
      confirm(
        'Overwrite existing entries?',
        `${overlapping.length} day${overlapping.length === 1 ? '' : 's'} in this range already ${overlapping.length === 1 ? 'has' : 'have'} an entry. Saving will replace ${overlapping.length === 1 ? 'it' : 'them'}.`,
        () => performSave(targetDates)
      );
    } else {
      performSave(targetDates);
    }
  }

  async function performSave(targetDates: string[]) {
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;

    const basePayload = {
      technician_id: selectedTechnicianId,
      mine_name: mineName.trim(),
      contact_person: contactPerson.trim() || null,
      contact_number: contactNumber.trim() || null,
      comments: comments.trim() || null,
      testing_type: testingType,
      tam_status: tamStatus,
      invoice_number: invoiceNumber.trim() || null,
      updated_by: uid,
    };

    let error;
    if (editingEntry) {
      ({ error } = await supabase
        .from('operational_calendar_entries')
        .update({ ...basePayload, entry_date: targetDates[0] })
        .eq('id', editingEntry.id));
    } else {
      const rows = targetDates.map(entry_date => ({ ...basePayload, entry_date, created_by: uid }));
      ({ error } = await supabase
        .from('operational_calendar_entries')
        .upsert(rows, { onConflict: 'technician_id,entry_date' }));
    }

    if (error) {
      setSaving(false);
      notify('Error', error.message);
      return;
    }

    // Remember this mine's contact info for next time, regardless of
    // whether this was a new entry or an edit.
    await supabase
      .from('operational_calendar_mine_presets')
      .upsert(
        {
          mine_name: mineName.trim(),
          contact_person: contactPerson.trim() || null,
          contact_number: contactNumber.trim() || null,
          updated_by: uid,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'mine_name_key' }
      );

    setSaving(false);
    setEntryModalVisible(false);
    if (selectedTechnicianId) fetchEntries(selectedTechnicianId);
    fetchMinePresets();
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
          {canEdit ? (
            <TouchableOpacity
              onPress={() => setDeleteMode(d => !d)}
              style={[styles.deleteModeBtn, deleteMode && styles.deleteModeBtnActive]}
            >
              <Trash2 color={deleteMode ? '#ffffff' : theme.muted} size={18} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 24 }} />
          )}
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

        {canEdit && (
          <Text style={[styles.dragHint, { color: theme.subtext }]}>
            {deleteMode
              ? 'Delete mode: press & drag across days to select, then confirm to delete.'
              : 'Tip: press & hold a filled day, then drag to copy it across other days.'}
          </Text>
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

        <ScrollView contentContainerStyle={{ paddingBottom: 24 }} scrollEnabled={!isDragging}>
          {/* Weekday header row */}
          <View style={styles.weekRow}>
            {WEEKDAY_LABELS.map(label => (
              <View key={label} style={[styles.weekdayHeaderCell, { width: cellWidth, backgroundColor: DAY_HEADER_BG }]}>
                <Text style={styles.weekdayHeaderText}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Grid — wrapped in a single view carrying the drag gesture so
              we can work out which day is under the finger with simple
              row/col math instead of measuring every cell. */}
          <View
            ref={gridRef}
            onLayout={measureGridOrigin}
            {...panResponder.panHandlers}
          >
            {weeks.map((week, wi) => (
              <View key={wi} style={styles.weekRow}>
                {week.map((dateStr, di) => {
                  if (!dateStr) {
                    return (
                      <View
                        key={di}
                        style={[styles.dayCell, { width: cellWidth, backgroundColor: CELL_EMPTY_BG, borderColor: CELL_BORDER }]}
                      />
                    );
                  }
                  const entry = entriesByDate[dateStr];
                  const dayNum = parseInt(dateStr.split('-')[2], 10);

                  const isFillHighlighted = dragInfo?.type === 'fill' && dragInfo.dates.includes(dateStr);
                  const isDragSource = dragInfo?.type === 'fill' && dragInfo.sourceDate === dateStr;
                  const isDeleteHighlighted = dragInfo?.type === 'delete' && dragInfo.dates.includes(dateStr);

                  return (
                    <TouchableOpacity
                      key={di}
                      activeOpacity={canEdit ? 1 : 0.7}
                      onPress={canEdit ? undefined : () => handleDayPress(dateStr)}
                      style={[
                        styles.dayCell,
                        { width: cellWidth, backgroundColor: getCellBackground(entry), borderColor: CELL_BORDER },
                        isFillHighlighted && !isDragSource && styles.dayCellFillHighlight,
                        isDragSource && styles.dayCellDragSource,
                        isDeleteHighlighted && styles.dayCellDeleteHighlight,
                      ]}
                    >
                      <Text style={styles.dayNumber}>{dayNum}</Text>

                      {entry && (
                        <View style={styles.dayCellContent}>
                          <Text style={styles.cellMineName} numberOfLines={2}>
                            {entry.mine_name}
                          </Text>
                          {entry.contact_person && (
                            <Text style={styles.cellSubText} numberOfLines={1}>
                              {entry.contact_person}
                            </Text>
                          )}
                          {entry.contact_number && (
                            <Text style={styles.cellSubText} numberOfLines={1}>
                              {entry.contact_number}
                            </Text>
                          )}
                          {entry.comments && (
                            <View style={styles.cellCommentBox}>
                              <Text style={styles.cellCommentText} numberOfLines={2}>
                                {entry.comments}
                              </Text>
                            </View>
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
          </View>
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
            {editingEntry ? (
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.subtext }]}>DATE</Text>
                <DatePickerField
                  value={dateFrom}
                  onChange={(v: string) => { setDateFrom(v); setDateTo(v); }}
                  placeholder="Select date"
                  isDark={isDark}
                  theme={theme}
                />
              </View>
            ) : (
              <View style={styles.dateRangeRow}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={[styles.fieldLabel, { color: theme.subtext }]}>DATE FROM</Text>
                  <DatePickerField
                    value={dateFrom}
                    onChange={(v: string) => { setDateFrom(v); if (dateTo < v) setDateTo(v); }}
                    placeholder="Select date"
                    isDark={isDark}
                    theme={theme}
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={[styles.fieldLabel, { color: theme.subtext }]}>DATE TO</Text>
                  <DatePickerField
                    value={dateTo}
                    onChange={setDateTo}
                    placeholder="Select date"
                    isDark={isDark}
                    theme={theme}
                  />
                </View>
              </View>
            )}
            {!editingEntry && dateTo !== dateFrom && (
              <Text style={[styles.rangeHint, { color: theme.subtext }]}>
                This will fill every day from {dateFrom} to {dateTo}.
              </Text>
            )}

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>MINE NAME *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                placeholder="e.g. Redpath Mining"
                placeholderTextColor={theme.muted}
                value={mineName}
                onChangeText={(v) => { setMineName(v); setShowMineSuggestions(true); }}
                onFocus={() => setShowMineSuggestions(true)}
              />
              {showMineSuggestions && filteredMineSuggestions.length > 0 && (
                <View style={[styles.dropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  {filteredMineSuggestions.map(preset => (
                    <TouchableOpacity
                      key={preset.mine_name}
                      style={[styles.dropdownItem, { borderBottomColor: theme.border }]}
                      onPress={() => selectMinePreset(preset)}
                    >
                      <Text style={[styles.dropdownItemText, { color: theme.text }]}>{preset.mine_name}</Text>
                      {(preset.contact_person || preset.contact_number) && (
                        <Text style={[styles.dropdownItemSub, { color: theme.subtext }]}>
                          {[preset.contact_person, preset.contact_number].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
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
  deleteModeBtn: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
  },
  deleteModeBtnActive: { backgroundColor: '#ef4444' },
  techPicker: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 46,
    marginHorizontal: 16, marginBottom: 8,
  },
  techPickerText: { flex: 1, fontSize: 14, fontWeight: '600' },
  readOnlyNote: { fontSize: 12, fontStyle: 'italic', marginHorizontal: 16, marginBottom: 6 },
  dragHint: { fontSize: 11.5, fontStyle: 'italic', marginHorizontal: 16, marginBottom: 6 },
  monthNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, paddingVertical: 8 },
  monthNavBtn: { padding: 8 },
  monthNavLabel: { fontSize: 16, fontWeight: '700', minWidth: 160, textAlign: 'center' },
  weekRow: { flexDirection: 'row' },
  weekdayHeaderCell: { paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  weekdayHeaderText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  dayCell: {
    height: ROW_HEIGHT, borderWidth: 1, padding: 4, overflow: 'hidden',
  },
  dayCellFillHighlight: { borderWidth: 2, borderColor: DRAG_FILL_BORDER, backgroundColor: DRAG_FILL_TINT },
  dayCellDragSource: { borderWidth: 2, borderColor: DRAG_SOURCE_BORDER },
  dayCellDeleteHighlight: { borderWidth: 2, borderColor: DRAG_DELETE_BORDER, backgroundColor: DRAG_DELETE_TINT },
  dayCellContent: { marginTop: 2, gap: 2 },
  dayNumber: { fontSize: 11, fontWeight: '700', color: CELL_TEXT_DARK },
  cellMineName: { fontSize: 9, fontWeight: '700', lineHeight: 11, color: CELL_TEXT_DARK },
  cellSubText: { fontSize: 7.5, lineHeight: 9, color: CELL_SUBTEXT_DARK },
  cellCommentBox: {
    backgroundColor: COMMENT_BG, borderWidth: 1.5, borderColor: COMMENT_BORDER,
    borderRadius: 3, paddingHorizontal: 3, paddingVertical: 2, marginTop: 2,
  },
  cellCommentText: { fontSize: 7, fontWeight: '700', color: CELL_TEXT_DARK, textAlign: 'center', lineHeight: 8.5 },
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
  dropdownItemSub: { fontSize: 12, marginTop: 2 },
  dateRangeRow: { flexDirection: 'row', gap: 12 },
  rangeHint: { fontSize: 12, fontStyle: 'italic', marginTop: -8, marginBottom: 16 },
  saveBtn: {
    backgroundColor: colors.yellow, borderRadius: 14, height: 56,
    alignItems: 'center', justifyContent: 'center', margin: 16,
  },
  saveBtnText: { color: colors.black, fontSize: 16, fontWeight: '700' },
});