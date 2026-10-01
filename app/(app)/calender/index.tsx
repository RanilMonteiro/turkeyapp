import { useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator, Modal, TextInput, useWindowDimensions,
  PanResponder, GestureResponderEvent,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, User, ChevronDown, ChevronLeft, ChevronRight, X, Trash2, Phone, MessageSquare, FileDown, Palette, Eraser, Check } from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';
import { notify, confirm } from '../../../lib/notify';
import { exportCalendarPdf, PdfScope, HIGHLIGHT_COLOURS, HighlightKey } from '../../../lib/calendarPdf';
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

const FINANCIAL_DOCUMENT_OPTIONS = ['Invoice Number', 'Order Number', 'Sales Order'];
// Short prefix shown on the grid cell itself, where space is tight.
const FINANCIAL_DOC_ABBR: Record<string, string> = {
  'Invoice Number': 'INV',
  'Order Number': 'PO',
  'Sales Order': 'SO',
};
function financialDocPlaceholder(type: string | null): string {
  if (type === 'Order Number') return 'e.g. PO 12345';
  if (type === 'Sales Order') return 'e.g. SO 16617';
  return 'e.g. INV 50521';
}

// Row height for the grid — needed so drag gestures can work out which
// day is under the finger using simple math instead of measuring every
// cell. Landscape gets a shorter row since the screen is a lot less tall.
const PORTRAIT_ROW_HEIGHT = 272;
const LANDSCAPE_ROW_HEIGHT = 250;

// Whether dragging one day onto others also copies its financial document
// (type + number). On by default: a fill-drag is usually one job spanning
// several days, so it makes sense for them to share the same document.
const COPY_FINANCIAL_DOC_ON_FILL = true;

// Cell colours (stored in their own table so empty days can be coloured too).
const HIGHLIGHT_TABLE = 'operational_calendar_highlights';
const COLOUR_HEX = Object.fromEntries(HIGHLIGHT_COLOURS.map(c => [c.key, c.color])) as Record<HighlightKey, string>;
const COLOUR_LABEL = Object.fromEntries(HIGHLIGHT_COLOURS.map(c => [c.key, c.label])) as Record<HighlightKey, string>;
type PaintColor = HighlightKey | 'erase';

type Technician = { id: string; full_name: string };

// Sites (from the Sites screen) that can be picked for a calendar entry, plus
// each site's contacts, which fill the contact person / number fields.
type SiteOption = { id: string; name: string };
type SiteContact = { site_id: string; name: string; phone: string | null };

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
  financial_document_type: string | null;
  financial_document_number: string | null;
  site_id: string | null;
};

type DragInfo =
  | { type: 'fill'; sourceDate: string; dates: string[] }
  | { type: 'delete'; dates: string[] }
  | { type: 'paint'; color: PaintColor; dates: string[] };

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

// Cells are white by default (filled or empty). A day only changes colour when
// someone paints it with one of the highlight colours.
function getCellBackground(colour: string | undefined): string {
  return colour ?? CELL_EMPTY_BG;
}

export default function OperationalCalendar() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const rowHeight = isLandscape ? LANDSCAPE_ROW_HEIGHT : PORTRAIT_ROW_HEIGHT;

  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);

  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string | null>(null);
  const [showTechDropdown, setShowTechDropdown] = useState(false);

  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [siteContacts, setSiteContacts] = useState<Record<string, SiteContact[]>>({});
  const [showSiteDropdown, setShowSiteDropdown] = useState(false);
  const [siteSearch, setSiteSearch] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
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
  const [financialDocType, setFinancialDocType] = useState<string | null>(null);
  const [financialDocNumber, setFinancialDocNumber] = useState('');
  const [showTestingTypeDropdown, setShowTestingTypeDropdown] = useState(false);
  const [showTamStatusDropdown, setShowTamStatusDropdown] = useState(false);
  const [showFinancialDocDropdown, setShowFinancialDocDropdown] = useState(false);
  const [saving, setSaving] = useState(false);

  // PDF export
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Cell colours for the selected technician, keyed by date
  const [highlights, setHighlights] = useState<Record<string, HighlightKey>>({});
  // Approved leave for the selected technician: date -> leave type (comes from the forms system)
  const [leaveDays, setLeaveDays] = useState<Record<string, string>>({});
  const [showColourPanel, setShowColourPanel] = useState(false);
  const [paintColor, setPaintColor] = useState<PaintColor | null>(null);

  // ---------- Drag-to-fill / drag-to-delete ----------
  const [deleteMode, setDeleteMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);

  const gridRef = useRef<View>(null);
  const gridOriginRef = useRef({ pageX: 0, pageY: 0 });
  const dragInfoRef = useRef<DragInfo | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartDateRef = useRef<string | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Mirrors the latest state into a ref so the PanResponder (created once
  // and never recreated) can always read fresh values instead of the
  // stale ones captured on its first render.
  const liveRef = useRef({
    canEdit: false,
    deleteMode: false,
    weeks: [] as (string | null)[][],
    cellWidth: 0,
    rowHeight: PORTRAIT_ROW_HEIGHT,
    entriesByDate: {} as Record<string, CalendarEntry>,
    selectedTechnicianId: null as string | null,
    paintColor: null as PaintColor | null,
    leaveDays: {} as Record<string, string>,
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
  // This already recalculates on rotation since it comes from
  // useWindowDimensions, so the grid itself adapts to landscape on its own.
  const cellWidth = (width - 4) / 7;

  // This screen supports both orientations. Unlock rotation while it's
  // focused, and lock back to portrait when leaving it, so the rest of
  // the app (which may assume portrait) isn't affected. Requires the
  // `expo-screen-orientation` package (`npx expo install
  // expo-screen-orientation`). If your app.json also has a hard
  // `"orientation": "portrait"` lock for standalone/EAS builds, that
  // takes precedence in production builds and needs to be changed to
  // `"default"` (or removed) for this to work outside of Expo Go.
  useFocusEffect(
    useCallback(() => {
      // Loosely typed on purpose: this package is optional. If it isn't
      // installed yet, this just no-ops (rotation stays locked) instead
      // of breaking the type-check or the build.
      let ScreenOrientation: any = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        ScreenOrientation = require('expo-screen-orientation');
      } catch {
        ScreenOrientation = null;
      }
      ScreenOrientation?.unlockAsync().catch(() => {});
      return () => {
        ScreenOrientation?.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      };
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      fetchAll();
      fetchSitesAndContacts();
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

  // Sites + their contacts come straight from the Sites screen's data, so the
  // calendar always offers the same sites and contact people.
  async function fetchSitesAndContacts() {
    const [sitesRes, contactsRes] = await Promise.all([
      supabase.from('sites').select('id, name').order('name'),
      supabase.from('site_contacts').select('site_id, name, phone').order('name'),
    ]);
    if (sitesRes.data) setSites(sitesRes.data);

    const grouped: Record<string, SiteContact[]> = {};
    (contactsRes.data ?? []).forEach((c: any) => {
      if (!grouped[c.site_id]) grouped[c.site_id] = [];
      grouped[c.site_id].push(c);
    });
    setSiteContacts(grouped);
  }

  useFocusEffect(
    useCallback(() => {
      if (selectedTechnicianId) fetchEntries(selectedTechnicianId);
    }, [selectedTechnicianId])
  );

  async function fetchEntries(technicianId: string) {
    const thisYear = new Date().getFullYear();
    const [entriesRes, highlightsRes, leaveRes] = await Promise.all([
      supabase
        .from('operational_calendar_entries')
        .select('*')
        .eq('technician_id', technicianId)
        .order('entry_date'),
      supabase
        .from(HIGHLIGHT_TABLE)
        .select('entry_date, color')
        .eq('technician_id', technicianId),
      // Final-approved leave from the forms system (one row per leave day)
      supabase.rpc('get_approved_leave', {
        p_technician_id: technicianId,
        p_from: `${thisYear - 1}-01-01`,
        p_to: `${thisYear + 2}-12-31`,
      }),
    ]);
    if (entriesRes.data) setEntries(entriesRes.data);

    const map: Record<string, HighlightKey> = {};
    (highlightsRes.data ?? []).forEach((h: any) => { map[h.entry_date] = h.color; });
    setHighlights(map);

    const leaveMap: Record<string, string> = {};
    (leaveRes.data ?? []).forEach((l: any) => { leaveMap[l.leave_date] = l.leave_type ?? ''; });
    setLeaveDays(leaveMap);
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
  liveRef.current.rowHeight = rowHeight;
  liveRef.current.entriesByDate = entriesByDate;
  liveRef.current.selectedTechnicianId = selectedTechnicianId;
  liveRef.current.paintColor = paintColor;
  liveRef.current.leaveDays = leaveDays;

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
      const leaveType = liveRef.current.leaveDays[dateStr];
      if (leaveType !== undefined) {
        confirm(
          'On approved leave',
          `This technician is on approved leave${leaveType ? ` (${leaveType})` : ''} on this day. Add an entry anyway?`,
          () => openNewEntryModal(dateStr)
        );
      } else {
        openNewEntryModal(dateStr);
      }
    }
  }

  // ---------- PDF export ----------

  async function handleExport(scope: PdfScope) {
    if (!selectedTechnicianId || !selectedTechnician) {
      notify('No technician', 'Select a technician first.');
      return;
    }
    setExporting(true);
    try {
      await exportCalendarPdf({
        technicianId: selectedTechnicianId,
        technicianName: selectedTechnician.full_name,
        scope,
        year: viewDate.year,
        month: viewDate.month,
      });
      setExportModalVisible(false);
    } catch (e: any) {
      notify('Export failed', e?.message ?? 'Could not create the PDF.');
    } finally {
      setExporting(false);
    }
  }

  // ---------- Drag gesture ----------

  function dateAtTouch(evt: GestureResponderEvent): string | null {
    const { pageX, pageY } = evt.nativeEvent;
    return dateAtPoint(pageX, pageY);
  }

  function dateAtPoint(pageX: number, pageY: number): string | null {
    const localX = pageX - gridOriginRef.current.pageX;
    const localY = pageY - gridOriginRef.current.pageY;
    if (localX < 0 || localY < 0) return null;
    const { weeks: liveWeeks, cellWidth: liveCellWidth, rowHeight: liveRowHeight } = liveRef.current;
    if (!liveCellWidth) return null;
    const col = Math.floor(localX / liveCellWidth);
    const row = Math.floor(localY / liveRowHeight);
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
      site_id: sourceEntry.site_id,
      contact_person: sourceEntry.contact_person,
      contact_number: sourceEntry.contact_number,
      comments: sourceEntry.comments,
      testing_type: sourceEntry.testing_type,
      tam_status: sourceEntry.tam_status,
      financial_document_type: COPY_FINANCIAL_DOC_ON_FILL ? sourceEntry.financial_document_type : null,
      financial_document_number: COPY_FINANCIAL_DOC_ON_FILL ? sourceEntry.financial_document_number : null,
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

  // Paint (or clear) a colour on a set of days. Updates the screen straight
  // away, then saves; if the save fails it reloads the real data.
  async function savePaint(color: PaintColor, dates: string[]) {
    const technicianId = liveRef.current.selectedTechnicianId;
    if (!technicianId || dates.length === 0) return;

    setHighlights(prev => {
      const next = { ...prev };
      dates.forEach(d => {
        if (color === 'erase') delete next[d];
        else next[d] = color;
      });
      return next;
    });

    let error;
    if (color === 'erase') {
      ({ error } = await supabase
        .from(HIGHLIGHT_TABLE)
        .delete()
        .eq('technician_id', technicianId)
        .in('entry_date', dates));
    } else {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      ({ error } = await supabase
        .from(HIGHLIGHT_TABLE)
        .upsert(
          dates.map(entry_date => ({
            technician_id: technicianId,
            entry_date,
            color,
            updated_by: uid,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: 'technician_id,entry_date' }
        ));
    }

    if (error) {
      notify('Error', error.message);
      fetchEntries(technicianId);
    }
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => liveRef.current.canEdit,
      onStartShouldSetPanResponder: () => liveRef.current.canEdit,
      onPanResponderGrant: (evt) => {
        measureGridOrigin();
        const startDate = dateAtTouch(evt);
        touchStartDateRef.current = startDate;
        lastPointRef.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };

        // Colour mode: touching a day starts painting straight away.
        const paint = liveRef.current.paintColor;
        if (paint) {
          if (startDate) {
            const info: DragInfo = { type: 'paint', color: paint, dates: [startDate] };
            dragInfoRef.current = info;
            setDragInfo(info);
            setIsDragging(true);
          }
          return;
        }

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
        const current = dragInfoRef.current;

        if (current.type === 'paint') {
          // Sample along the path between the last and current finger position
          // so fast swipes don't skip over days.
          const px = evt.nativeEvent.pageX;
          const py = evt.nativeEvent.pageY;
          const from = lastPointRef.current ?? { x: px, y: py };
          const { cellWidth: cw, rowHeight: rh } = liveRef.current;
          const step = Math.max(4, Math.min(cw, rh) / 3);
          const steps = Math.max(1, Math.ceil(Math.hypot(px - from.x, py - from.y) / step));
          const added: string[] = [];
          for (let i = 1; i <= steps; i++) {
            const d = dateAtPoint(from.x + ((px - from.x) * i) / steps, from.y + ((py - from.y) * i) / steps);
            if (d && !current.dates.includes(d) && !added.includes(d)) added.push(d);
          }
          lastPointRef.current = { x: px, y: py };
          if (added.length > 0) {
            const next: DragInfo = { ...current, dates: [...current.dates, ...added] };
            dragInfoRef.current = next;
            setDragInfo(next);
          }
          return;
        }

        const dateStr = dateAtTouch(evt);
        if (!dateStr) return;

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
          else if (info.type === 'paint') savePaint(info.color, info.dates);
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
    setFinancialDocType(null);
    setFinancialDocNumber('');
    setSelectedSiteId(null);
    setShowSiteDropdown(false);
    setSiteSearch('');
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
    setFinancialDocType(entry.financial_document_type);
    setFinancialDocNumber(entry.financial_document_number ?? '');
    setSelectedSiteId(entry.site_id ?? null);
    setShowSiteDropdown(false);
    setSiteSearch('');
    setDetailEntry(null);
    setEntryModalVisible(true);
  }

  const filteredSites = siteSearch.trim()
    ? sites.filter(site => site.name.toLowerCase().includes(siteSearch.trim().toLowerCase()))
    : sites;

  // Picking a site fills the site name and the contact people / numbers from
  // that site's contacts (joined with "/" like the sheet: "Renier/Doug").
  // Both fields stay editable if one day needs something different.
  function selectSite(site: SiteOption) {
    const contacts = siteContacts[site.id] ?? [];
    setSelectedSiteId(site.id);
    setMineName(site.name);
    setContactPerson(contacts.map(c => c.name).join('/'));
    setContactNumber(contacts.map(c => c.phone).filter(Boolean).join('/'));
    setShowSiteDropdown(false);
    setSiteSearch('');
  }

  async function handleSaveEntry() {
    if (!mineName.trim()) {
      notify('Missing site', 'Please select a site.');
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

  // If an edit changes the financial document, look for other days (for
  // the same technician) that currently carry the exact same old
  // type+number — those are the days that were "made from that" same
  // document (e.g. created together via a date range or a fill-drag).
  // Days with a different document are a different job and are left
  // alone.
  async function updateRelatedFinancialDocs(dates: string[], type: string | null, number: string | null) {
    if (!selectedTechnicianId || dates.length === 0) return;
    const { error } = await supabase
      .from('operational_calendar_entries')
      .update({ financial_document_type: type, financial_document_number: number })
      .eq('technician_id', selectedTechnicianId)
      .in('entry_date', dates);
    if (error) {
      notify('Error', error.message);
    } else {
      fetchEntries(selectedTechnicianId);
    }
  }

  async function performSave(targetDates: string[]) {
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;

    const basePayload = {
      technician_id: selectedTechnicianId,
      mine_name: mineName.trim(),
      site_id: selectedSiteId,
      contact_person: contactPerson.trim() || null,
      contact_number: contactNumber.trim() || null,
      comments: comments.trim() || null,
      testing_type: testingType,
      tam_status: tamStatus,
      financial_document_type: financialDocType,
      financial_document_number: financialDocNumber.trim() || null,
      updated_by: uid,
    };

    let error;
    let relatedDates: string[] = [];
    let newDocType = basePayload.financial_document_type;
    let newDocNumber = basePayload.financial_document_number;

    if (editingEntry) {
      const oldDocType = editingEntry.financial_document_type;
      const oldDocNumber = editingEntry.financial_document_number;
      const docChanged = oldDocType !== newDocType || oldDocNumber !== newDocNumber;

      // Only entries that had a real document before (not blank) can be
      // "related" to this one.
      if (docChanged && oldDocType && oldDocNumber) {
        relatedDates = entries
          .filter(e =>
            e.id !== editingEntry.id &&
            e.technician_id === editingEntry.technician_id &&
            e.financial_document_type === oldDocType &&
            e.financial_document_number === oldDocNumber
          )
          .map(e => e.entry_date);
      }

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

    setSaving(false);
    setEntryModalVisible(false);
    if (selectedTechnicianId) fetchEntries(selectedTechnicianId);

    if (relatedDates.length > 0) {
      confirm(
        'Update related days?',
        `${relatedDates.length} other day${relatedDates.length === 1 ? '' : 's'} ` +
          `${relatedDates.length === 1 ? 'shares' : 'share'} this same financial document. ` +
          `Update ${relatedDates.length === 1 ? 'it' : 'them'} to the new one too?`,
        () => updateRelatedFinancialDocs(relatedDates, newDocType, newDocNumber)
      );
    }
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
        <View style={[styles.header, isLandscape && styles.headerLandscape]}>
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft color={colors.yellow} size={24} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Operational Calendar</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => setExportModalVisible(true)} style={styles.deleteModeBtn}>
              <FileDown color={colors.yellow} size={20} />
            </TouchableOpacity>
            {canEdit && (
              <TouchableOpacity
                onPress={() => { setDeleteMode(d => !d); setPaintColor(null); }}
                style={[styles.deleteModeBtn, deleteMode && styles.deleteModeBtnActive]}
              >
                <Trash2 color={deleteMode ? '#ffffff' : theme.muted} size={18} />
              </TouchableOpacity>
            )}
          </View>
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

        {/* Colours — open the key, pick a colour, then tap/drag over days */}
        <View style={styles.colourBar}>
          <TouchableOpacity
            onPress={() => setShowColourPanel(v => !v)}
            style={[styles.colourBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <Palette color={colors.yellow} size={16} />
            <Text style={[styles.colourBtnText, { color: theme.text }]}>Colours</Text>
            <ChevronDown color={theme.muted} size={16} />
          </TouchableOpacity>

          {paintColor && (
            <View style={[styles.paintBanner, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View
                style={[
                  styles.colourSwatchSmall,
                  { backgroundColor: paintColor === 'erase' ? CELL_EMPTY_BG : COLOUR_HEX[paintColor] },
                ]}
              />
              <Text style={[styles.paintBannerText, { color: theme.text }]} numberOfLines={1}>
                {paintColor === 'erase' ? 'Clearing colour' : COLOUR_LABEL[paintColor]} · tap or drag over days
              </Text>
              <TouchableOpacity onPress={() => setPaintColor(null)}>
                <Text style={styles.paintDone}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {showColourPanel && (
          <View style={[styles.colourPanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {HIGHLIGHT_COLOURS.map(c => (
              <TouchableOpacity
                key={c.key}
                disabled={!canEdit}
                activeOpacity={0.7}
                style={[
                  styles.colourRow,
                  { borderBottomColor: theme.border },
                  paintColor === c.key && { backgroundColor: `${colors.yellow}20` },
                ]}
                onPress={() => {
                  setPaintColor(c.key);
                  setDeleteMode(false);
                  setShowColourPanel(false);
                }}
              >
                <View style={[styles.colourSwatch, { backgroundColor: c.color }]} />
                <Text style={[styles.colourLabel, { color: theme.text }]}>{c.label}</Text>
                {paintColor === c.key && <Check color={colors.yellow} size={16} />}
              </TouchableOpacity>
            ))}
            {canEdit && (
              <TouchableOpacity
                activeOpacity={0.7}
                style={[
                  styles.colourRow,
                  { borderBottomColor: theme.border },
                  paintColor === 'erase' && { backgroundColor: `${colors.yellow}20` },
                ]}
                onPress={() => {
                  setPaintColor('erase');
                  setDeleteMode(false);
                  setShowColourPanel(false);
                }}
              >
                <View style={[styles.colourSwatch, { alignItems: 'center', justifyContent: 'center', backgroundColor: CELL_EMPTY_BG }]}>
                  <Eraser color="#64748b" size={13} />
                </View>
                <Text style={[styles.colourLabel, { color: theme.text }]}>Clear colour</Text>
                {paintColor === 'erase' && <Check color={colors.yellow} size={16} />}
              </TouchableOpacity>
            )}
            <Text style={[styles.colourHint, { color: theme.subtext }]}>
              {canEdit ? 'Pick a colour, then tap or drag over the days you want to colour.' : 'View only'}
            </Text>
            <Text style={[styles.colourHint, { color: theme.subtext, paddingTop: 0 }]}>
              Approved leave appears automatically as a purple LEAVE badge.
            </Text>
          </View>
        )}

        {!canEdit && (
          <Text style={[styles.readOnlyNote, { color: theme.muted }]}>View only</Text>
        )}

        {canEdit && !paintColor && (
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

        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          scrollEnabled={!isDragging}
          onScroll={measureGridOrigin}
          scrollEventThrottle={32}
        >
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
                        style={[styles.dayCell, { width: cellWidth, height: rowHeight, backgroundColor: CELL_EMPTY_BG, borderColor: CELL_BORDER }]}
                      />
                    );
                  }
                  const entry = entriesByDate[dateStr];
                  const dayNum = parseInt(dateStr.split('-')[2], 10);

                  const isFillHighlighted = dragInfo?.type === 'fill' && dragInfo.dates.includes(dateStr);
                  const isDragSource = dragInfo?.type === 'fill' && dragInfo.sourceDate === dateStr;
                  const isDeleteHighlighted = dragInfo?.type === 'delete' && dragInfo.dates.includes(dateStr);
                  const paintPreview = dragInfo?.type === 'paint' && dragInfo.dates.includes(dateStr) ? dragInfo.color : null;
                  const savedColour = highlights[dateStr] ? COLOUR_HEX[highlights[dateStr]] : undefined;
                  const cellColour = paintPreview
                    ? (paintPreview === 'erase' ? undefined : COLOUR_HEX[paintPreview])
                    : savedColour;

                  return (
                    <TouchableOpacity
                      key={di}
                      activeOpacity={canEdit ? 1 : 0.7}
                      onPress={canEdit ? undefined : () => handleDayPress(dateStr)}
                      style={[
                        styles.dayCell,
                        { width: cellWidth, height: rowHeight, backgroundColor: getCellBackground(cellColour), borderColor: CELL_BORDER },
                        isFillHighlighted && !isDragSource && styles.dayCellFillHighlight,
                        isDragSource && styles.dayCellDragSource,
                        isDeleteHighlighted && styles.dayCellDeleteHighlight,
                      ]}
                    >
                      <Text style={styles.dayNumber}>{dayNum}</Text>

                      {leaveDays[dateStr] !== undefined && (
                        <View style={styles.cellLeaveBadge}>
                          <Text style={styles.cellLeaveTitle}>LEAVE</Text>
                          {!!leaveDays[dateStr] && (
                            <Text style={styles.cellLeaveType} numberOfLines={2}>
                              {leaveDays[dateStr]}
                            </Text>
                          )}
                        </View>
                      )}

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
                          {entry.financial_document_number && (
                            <Text style={styles.cellInvoiceText} numberOfLines={1}>
                              {`${FINANCIAL_DOC_ABBR[entry.financial_document_type ?? ''] ?? ''} ${entry.financial_document_number}`.trim()}
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

      {/* Export PDF modal */}
      <Modal
        visible={exportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !exporting && setExportModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => !exporting && setExportModalVisible(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.pickerSheet, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <Text style={[styles.pickerTitle, { color: theme.text }]}>Export PDF</Text>
            <Text style={{ color: theme.subtext, fontSize: 13, marginBottom: 12 }}>
              {selectedTechnician?.full_name ?? ''}
            </Text>

            {exporting ? (
              <View style={{ paddingVertical: 24 }}>
                <ActivityIndicator color={colors.yellow} size="large" />
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.dropdownItem, { borderBottomColor: theme.border }]}
                  onPress={() => handleExport('month')}
                >
                  <Text style={[styles.dropdownItemText, { color: theme.text }]}>
                    This month · {new Date(viewDate.year, viewDate.month, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.dropdownItem, { borderBottomWidth: 0 }]}
                  onPress={() => handleExport('year')}
                >
                  <Text style={[styles.dropdownItemText, { color: theme.text }]}>
                    Full year · {viewDate.year}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
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
                  {detailDate && highlights[detailDate] && (
                    <View style={[styles.pill, { backgroundColor: COLOUR_HEX[highlights[detailDate]] }]}>
                      <Text style={[styles.pillText, { color: '#0f172a' }]}>{COLOUR_LABEL[highlights[detailDate]]}</Text>
                    </View>
                  )}
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

                {detailEntry.financial_document_number && (
                  <Text style={styles.invoiceText}>
                    {detailEntry.financial_document_type ?? 'Financial Document'}: {detailEntry.financial_document_number}
                  </Text>
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
          <View style={[styles.modalHeader, isLandscape && styles.modalHeaderLandscape, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setEntryModalVisible(false)}>
              <X color={theme.muted} size={24} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {editingEntry ? 'Edit Entry' : 'New Entry'}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={[styles.formCard, isLandscape && styles.formCardLandscape, { backgroundColor: theme.card, borderColor: theme.border }]}>
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
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>SITE *</Text>
              <TouchableOpacity
                style={[styles.dropdownBtn, { backgroundColor: theme.input, borderColor: theme.border }]}
                onPress={() => setShowSiteDropdown(v => !v)}
              >
                <Text
                  style={[styles.dropdownBtnText, { color: mineName ? theme.text : theme.subtext }]}
                  numberOfLines={1}
                >
                  {mineName || 'Select site'}
                </Text>
                <ChevronDown color={theme.muted} size={16} />
              </TouchableOpacity>
              {showSiteDropdown && (
                <View style={[styles.dropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text, margin: 8 }]}
                    placeholder="Search sites..."
                    placeholderTextColor={theme.muted}
                    value={siteSearch}
                    onChangeText={setSiteSearch}
                  />
                  <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {filteredSites.length === 0 ? (
                      <Text style={[styles.dropdownItemSub, { color: theme.subtext, padding: 14 }]}>
                        {sites.length === 0 ? 'No sites yet. Sites are added on the Sites screen.' : 'No sites match that search.'}
                      </Text>
                    ) : (
                      filteredSites.map(site => {
                        const contacts = siteContacts[site.id] ?? [];
                        const summary = [
                          contacts.map(c => c.name).join('/'),
                          contacts.map(c => c.phone).filter(Boolean).join('/'),
                        ].filter(Boolean).join(' · ');
                        return (
                          <TouchableOpacity
                            key={site.id}
                            style={[
                              styles.dropdownItem,
                              { borderBottomColor: theme.border },
                              selectedSiteId === site.id && { backgroundColor: `${colors.yellow}20` },
                            ]}
                            onPress={() => selectSite(site)}
                          >
                            <Text style={[styles.dropdownItemText, { color: selectedSiteId === site.id ? colors.yellow : theme.text }]}>
                              {site.name}
                            </Text>
                            {!!summary && (
                              <Text style={[styles.dropdownItemSub, { color: theme.subtext }]} numberOfLines={1}>
                                {summary}
                              </Text>
                            )}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
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
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>FINANCIAL DOCUMENT</Text>
              <TouchableOpacity
                style={[styles.dropdownBtn, { backgroundColor: theme.input, borderColor: theme.border }]}
                onPress={() => setShowFinancialDocDropdown(!showFinancialDocDropdown)}
              >
                <Text style={[styles.dropdownBtnText, { color: financialDocType ? theme.text : theme.subtext }]}>
                  {financialDocType ?? 'Select document type'}
                </Text>
                <ChevronDown color={theme.muted} size={16} />
              </TouchableOpacity>
              {showFinancialDocDropdown && (
                <View style={[styles.dropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  {FINANCIAL_DOCUMENT_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.dropdownItem, { borderBottomColor: theme.border }, financialDocType === opt && { backgroundColor: `${colors.yellow}20` }]}
                      onPress={() => { setFinancialDocType(opt); setShowFinancialDocDropdown(false); }}
                    >
                      <Text style={[styles.dropdownItemText, { color: financialDocType === opt ? colors.yellow : theme.text }]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TextInput
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text, marginTop: 8 }]}
                placeholder={financialDocPlaceholder(financialDocType)}
                placeholderTextColor={theme.muted}
                value={financialDocNumber}
                onChangeText={setFinancialDocNumber}
              />
              {editingEntry && (financialDocType !== editingEntry.financial_document_type || financialDocNumber.trim() !== (editingEntry.financial_document_number ?? '')) && editingEntry.financial_document_type && editingEntry.financial_document_number && (
                <Text style={[styles.rangeHint, { color: theme.subtext, marginTop: 8, marginBottom: 0 }]}>
                  Any other days sharing the current document will be offered the same change when you save.
                </Text>
              )}
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
  headerLandscape: { paddingTop: 24, paddingBottom: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 24 },
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
  colourBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8 },
  colourBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 40 },
  colourBtnText: { fontSize: 14, fontWeight: '600' },
  paintBanner: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 40 },
  paintBannerText: { flex: 1, fontSize: 12.5, fontWeight: '600' },
  paintDone: { color: colors.yellow, fontWeight: '700', fontSize: 13 },
  colourPanel: { borderWidth: 1, borderRadius: 12, marginHorizontal: 16, marginBottom: 8, overflow: 'hidden' },
  colourRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  colourSwatch: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#64748b' },
  colourSwatchSmall: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: '#64748b' },
  colourLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  colourHint: { fontSize: 11.5, fontStyle: 'italic', padding: 10 },
  cellLeaveBadge: {
    backgroundColor: '#ede9fe', borderWidth: 1.5, borderColor: '#7c3aed', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 5, marginTop: 4, alignItems: 'center',
  },
  cellLeaveTitle: { fontSize: 13, fontWeight: '800', color: '#5b21b6', letterSpacing: 0.6 },
  cellLeaveType: { fontSize: 12, fontWeight: '700', color: '#5b21b6', textAlign: 'center', marginTop: 1 },
  monthNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, paddingVertical: 8 },
  monthNavBtn: { padding: 8 },
  monthNavLabel: { fontSize: 16, fontWeight: '700', minWidth: 160, textAlign: 'center' },
  weekRow: { flexDirection: 'row' },
  weekdayHeaderCell: { paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  weekdayHeaderText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  dayCell: {
    borderWidth: 1, padding: 4, overflow: 'hidden',
  },
  dayCellFillHighlight: { borderWidth: 2, borderColor: DRAG_FILL_BORDER, backgroundColor: DRAG_FILL_TINT },
  dayCellDragSource: { borderWidth: 2, borderColor: DRAG_SOURCE_BORDER },
  dayCellDeleteHighlight: { borderWidth: 2, borderColor: DRAG_DELETE_BORDER, backgroundColor: DRAG_DELETE_TINT },
  dayCellContent: { marginTop: 4, gap: 6 },
  dayNumber: { fontSize: 18, fontWeight: '700', color: CELL_TEXT_DARK },
  cellMineName: { fontSize: 15.5, fontWeight: '700', lineHeight: 19, color: CELL_TEXT_DARK },
  cellSubText: { fontSize: 13, lineHeight: 16, color: CELL_SUBTEXT_DARK },
  cellCommentBox: {
    backgroundColor: COMMENT_BG, borderWidth: 1.5, borderColor: COMMENT_BORDER,
    borderRadius: 5, paddingHorizontal: 6, paddingVertical: 5, marginTop: 2,
  },
  cellCommentText: { fontSize: 13, fontWeight: '700', color: CELL_TEXT_DARK, textAlign: 'center', lineHeight: 16 },
  cellPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, marginTop: 2 },
  cellPillText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  cellInvoiceText: { fontSize: 13, fontWeight: '700', color: INVOICE_COLOR, marginTop: 4, textAlign: 'center' },
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
  modalHeaderLandscape: { paddingTop: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  formCard: { margin: 16, borderRadius: 20, padding: 20, borderWidth: 1 },
  formCardLandscape: { maxWidth: 560, alignSelf: 'center', width: '100%' },
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