import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import RequirePermission from '../../../components/RequirePermission';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator, Modal, TextInput, useWindowDimensions,
  PanResponder, GestureResponderEvent, Platform,
  BackHandler, Linking,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, User, ChevronDown, ChevronLeft, ChevronRight, X, Trash2, Phone, MessageSquare, FileDown, Palette, Eraser, Check, Search, MapPin, Key, ZoomIn, ZoomOut } from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';
import { getHolidayName } from '../../../lib/saHolidays';
import { mapsUrlFor, isUrl } from '../../../lib/maps';
import { notify, confirm } from '../../../lib/notify';
import {
  exportCalendarPdf, PdfScope, HIGHLIGHT_COLOURS, HighlightKey, optionColour,
  financialDocParts, adjacentDayNumber,
} from '../../../lib/calendarPdf';
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
const [skipWeekends, setSkipWeekends] = useState(false);

// Matches the green / tan / red color coding from the spreadsheet.
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
// Greyed-out days outside the month
const CELL_PAD_BG = '#e2e8f0';
const WEEKEND_BG = '#d5dbe3'; // empty Saturdays / Sundays (matches the PDF)
const CELL_PAD_TEXT = '#94a3b8';
// Highlighted (selected) days
const DRAG_FILL_BORDER = '#2563eb';
const DRAG_FILL_TINT = '#bfdbfe';
const DRAG_SOURCE_BORDER = '#b45309';

const TESTING_TYPE_OPTIONS = ['Brake Testing', 'Lux Testing', 'Brake and Lux Testing', 'Brake and Inspection', 'Inspections'];
const TAM_STATUS_OPTIONS = ['On TAM', 'Not On TAM'];
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Quote -> Sales Order -> Invoice. A Quote/Sales Order stands alone; once it
// becomes an Invoice the Sales Order number is kept alongside it.
const FINANCIAL_DOCUMENT_OPTIONS = ['Quote', 'Sales Order', 'Invoice'];
function financialDocPlaceholder(type: string | null): string {
  if (type === 'Quote') return 'e.g. QT 12345';
  if (type === 'Sales Order') return 'e.g. SO 16617';
  return 'e.g. INV 50521';
}

// Row height for the grid — needed so drag gestures can work out which
// day is under the finger using simple math instead of measuring every
// cell. Landscape gets a shorter row since the screen is a lot less tall.
const PORTRAIT_ROW_HEIGHT = 272;
const LANDSCAPE_ROW_HEIGHT = 250;

// Whether copying one day onto others also copies its financial document
// (type + numbers). On by default: a copy is usually one job spanning
// several days, so it makes sense for them to share the same document.
const COPY_FINANCIAL_DOC_ON_FILL = true;

// Cell colours (stored in their own table so empty days can be coloured too).
const HIGHLIGHT_TABLE = 'operational_calendar_highlights';
const COLOUR_HEX = Object.fromEntries(HIGHLIGHT_COLOURS.map(c => [c.key, c.color])) as Record<HighlightKey, string>;
const COLOUR_LABEL = Object.fromEntries(HIGHLIGHT_COLOURS.map(c => [c.key, c.label])) as Record<HighlightKey, string>;
type PaintColor = HighlightKey | 'erase';

type Technician = { id: string; full_name: string; branch_id?: string | null };
type BranchOption = { id: string; name: string };
const UNASSIGNED_BRANCH = '__unassigned__';

// Sites (from the Sites screen) that can be picked for a calendar entry, plus
// each site's contacts, which fill the contact person / number fields.
type SiteOption = { id: string; name: string };
type SiteContact = { site_id: string; name: string; phone: string | null };

type CalendarEntry = {
  id: string;
  technician_id: string;
  entry_date: string;
  // null for note-only days (no site picked)
  mine_name: string | null;
  contact_person: string | null;
  contact_number: string | null;
  comments: string | null;
  testing_type: string | null;
  tam_status: string | null;
  financial_document_type: string | null;
  financial_document_number: string | null;
  sales_order_number: string | null;
  site_id: string | null;
};

// While a finger is down: either highlighting a range of days, or painting colours.
type DragInfo =
  | { type: 'select'; sourceDate: string; dates: string[] }
  | { type: 'paint'; color: PaintColor; dates: string[] };

// What stays highlighted after the finger lifts (until copied, deleted or cleared).
// ---- Site search (across every technician) ----
type SearchRow = {
  id: string;
  technician_id: string;
  entry_date: string;
  mine_name: string | null;
  testing_type: string | null;
  tam_status: string | null;
  technician?: { full_name: string | null } | null;
};
type SearchRange = {
  techId: string; techName: string; start: string; end: string; days: number;
  testing: string | null; tam: string | null;
};
type SearchGroup = { key: string; site: string; ranges: SearchRange[]; techCount: number; dayCount: number };

// Turns raw rows into: one group per site -> tidy date ranges per technician
// (back-to-back days, and Fri -> Mon, are merged into one line "12 – 16 Oct").
function buildSearchGroups(rows: SearchRow[]): SearchGroup[] {
  const sorted = [...rows].sort((a, b) =>
    (a.mine_name ?? '').trim().toLowerCase().localeCompare((b.mine_name ?? '').trim().toLowerCase()) ||
    a.technician_id.localeCompare(b.technician_id) ||
    a.entry_date.localeCompare(b.entry_date)
  );
  const groups = new Map<string, SearchGroup>();
  const last = new Map<string, SearchRange>();
  for (const r of sorted) {
    const site = (r.mine_name ?? '').trim() || 'Unnamed site';
    const key = site.toLowerCase();
    if (!groups.has(key)) groups.set(key, { key, site, ranges: [], techCount: 0, dayCount: 0 });
    const g = groups.get(key)!;
    g.dayCount++;
    const lk = `${key}|${r.technician_id}`;
    const prev = last.get(lk);
    const gap = prev ? diffDays(prev.end, r.entry_date) : 0;
    const prevIsFriday = prev ? new Date(prev.end + 'T00:00:00').getDay() === 5 : false;
    if (prev && prev.testing === r.testing_type && prev.tam === r.tam_status && (gap === 1 || (gap === 3 && prevIsFriday))) {
      prev.end = r.entry_date;
      prev.days++;
    } else {
      const range: SearchRange = {
        techId: r.technician_id,
        techName: r.technician?.full_name ?? 'Unknown technician',
        start: r.entry_date, end: r.entry_date, days: 1,
        testing: r.testing_type, tam: r.tam_status,
      };
      g.ranges.push(range);
      last.set(lk, range);
    }
  }
  const out = Array.from(groups.values());
  out.forEach(g => {
    g.ranges.sort((a, b) => a.start.localeCompare(b.start) || a.techName.localeCompare(b.techName));
    g.techCount = new Set(g.ranges.map(r => r.techId)).size;
  });
  return out.sort((a, b) => a.site.localeCompare(b.site));
}

function formatRangeLabel(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  if (start === end) return s.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const left = s.toLocaleDateString('en-ZA', sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
  const right = e.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${left} – ${right}`;
}

type Selection = { sourceDate: string; dates: string[] };

// Entries picked up with Copy / Move, waiting to be pasted. Each item keeps its
// distance (in days) from the first one, so the layout is preserved wherever
// you paste it - down a row, diagonally, another month, or another technician.
type Clipboard = {
  mode: 'copy' | 'move';
  sourceTechId: string;
  items: { offset: number; entry: CalendarEntry }[];
};

function toDateString(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

// Every date string between from/to inclusive — used to spread one
// entry across multiple days when the person sets a date range, and
// to work out which days a highlight-drag gesture passed over.
function expandDateRange(from: string, to: string, skipWeekends = false): string[] {
  const dates: string[] = [];
  let current = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  while (current <= end) {
    const dow = current.getDay(); // 0 = Sun, 6 = Sat
    if (!(skipWeekends && (dow === 0 || dow === 6))) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, '0');
      const d = String(current.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// Whole days between two yyyy-mm-dd strings (b - a), and date + n days.
function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}
function addDaysStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

// Dragging from one day to another highlights the BLOCK of cells between
// them on the grid (like a spreadsheet), so dragging down or diagonally
// picks exactly the cells inside that rectangle.
function rectDates(weeks: (string | null)[][], a: string, b: string): string[] {
  let ar = -1, ac = -1, br = -1, bc = -1;
  weeks.forEach((w, r) => w.forEach((d, c) => {
    if (d === a) { ar = r; ac = c; }
    if (d === b) { br = r; bc = c; }
  }));
  if (ar < 0 || br < 0) return computeRangeDates(a, b);
  const out: string[] = [];
  for (let r = Math.min(ar, br); r <= Math.max(ar, br); r++) {
    for (let c = Math.min(ac, bc); c <= Math.max(ac, bc); c++) {
      const d = weeks[r]?.[c];
      if (d) out.push(d);
    }
  }
  return out;
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

const ZOOM_STEPS = [0.6, 0.7, 0.8, 0.9, 1, 1.15, 1.3];

function readPref(key: string): string | null {
  try { return (globalThis as any).localStorage?.getItem(key) ?? null; } catch { return null; }
}

// Cells are white by default (filled or empty). A day only changes colour when
// someone paints it with one of the highlight colours.
function getCellBackground(colour: string | undefined): string {
  return colour ?? CELL_EMPTY_BG;
}

// Long site names get a smaller font so they fit on fewer lines and don't push
// the contact numbers / document number out of the cell.
function titleFontSize(name: string): number {
  const n = name.length;
  if (n <= 16) return 15.5;
  if (n <= 24) return 13.5;
  if (n <= 34) return 12;
  if (n <= 46) return 10.5;
  return 9.5;
}

function OperationalCalendar() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  // "Compact" hides everything except the date changer, to give the grid the whole screen
  const [compact, setCompact] = useState<boolean>(() => readPref('opcal_compact') === '1');
  // Zoom: scales row height and the text inside each cell (remembered on web,
  // so someone on a small laptop only has to set it once).
  const [zoom, setZoom] = useState<number>(() => {
    const v = parseFloat(readPref('opcal_zoom') ?? '');
    return ZOOM_STEPS.includes(v) ? v : 1;
  });
  const rowHeight = Math.round((isLandscape ? LANDSCAPE_ROW_HEIGHT : PORTRAIT_ROW_HEIGHT) * zoom);

  // Cell text/padding scaled with the zoom
  const cs = useMemo(() => {
    const keys = ['dayCellContent', 'dayNumber', 'cellMineName', 'cellSubText', 'cellCommentBox', 'cellCommentText',
      'cellPill', 'cellPillText', 'cellInvoiceText', 'cellInvoiceTextSide', 'cellHolidayName',
      'cellLeaveBadge', 'cellLeaveTitle', 'cellLeaveType', 'cellDocRow'] as const;
    const scaleProps = ['fontSize', 'lineHeight', 'gap', 'marginTop', 'paddingHorizontal', 'paddingVertical', 'borderRadius'];
    const out: Record<string, any> = {};
    keys.forEach(k => {
      const flat: any = { ...((StyleSheet.flatten((styles as any)[k]) as any) ?? {}) };
      if (zoom !== 1) {
        scaleProps.forEach(pr => { if (typeof flat[pr] === 'number') flat[pr] = Math.round(flat[pr] * zoom * 10) / 10; });
      }
      out[k] = flat;
    });
    return out as Record<typeof keys[number], any>;
  }, [zoom]);

  useEffect(() => {
    try {
      const ls = (globalThis as any).localStorage;
      if (ls) { ls.setItem('opcal_zoom', String(zoom)); ls.setItem('opcal_compact', compact ? '1' : '0'); }
    } catch {}
  }, [zoom, compact]);

  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);

  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string | null>(null);
  const [showTechDropdown, setShowTechDropdown] = useState(false);
  // Technician picker is two steps: pick a branch (Field Service / Head Office), then a technician
  const [branchOptions, setBranchOptions] = useState<BranchOption[]>([]);
  const [pickerBranchId, setPickerBranchId] = useState<string | null>(null);

  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [siteContacts, setSiteContacts] = useState<Record<string, SiteContact[]>>({});
  const [showSiteDropdown, setShowSiteDropdown] = useState(false);
  const [siteSearch, setSiteSearch] = useState('');
  const [addingSite, setAddingSite] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // Day detail modal (tap a filled day — shows everything including
  // comments, plus Edit if permitted)
  const [detailEntry, setDetailEntry] = useState<CalendarEntry | null>(null);
  // Location (Google Maps link) + access info of the site, shown in the day summary
  const [detailSite, setDetailSite] = useState<{ address: string | null; access_info: string | null } | null>(null);
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
  const [salesOrderNumber, setSalesOrderNumber] = useState('');
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

  // ---------- Highlight (select) days, then copy / delete ----------
  const [isDragging, setIsDragging] = useState(false);
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<'upcoming' | 'all'>('upcoming');
  const [searchRows, setSearchRows] = useState<SearchRow[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchCapped, setSearchCapped] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());

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
    selection: null as Selection | null,
    clipboard: null as Clipboard | null,
    pasteAt: (_d: string) => {},
    weeks: [] as (string | null)[][],
    cellWidth: 0,
    rowHeight: PORTRAIT_ROW_HEIGHT,
    entriesByDate: {} as Record<string, CalendarEntry>,
    selectedTechnicianId: null as string | null,
    paintColor: null as PaintColor | null,
    leaveDays: {} as Record<string, string>,
    techNames: {} as Record<string, string>,
  });

  // Phone back button: close whatever is open on top of the calendar first
  // (pop-ups, a pending paste, highlighted days) so it returns to the calendar
  // instead of leaving the screen.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showSearch) { setShowSearch(false); return true; }
      if (showMonthPicker) { setShowMonthPicker(false); return true; }
      if (showTechDropdown) { setShowTechDropdown(false); return true; }
      if (exportModalVisible && !exporting) { setExportModalVisible(false); return true; }
      if (entryModalVisible) { setEntryModalVisible(false); return true; }
      if (detailEntry) { setDetailEntry(null); return true; }
      if (clipboard) { setClipboard(null); return true; }
      if (selection) { setSelection(null); return true; }
      if (paintColor) { setPaintColor(null); return true; }
      return false;
    });
    return () => sub.remove();
  }, [showSearch, showMonthPicker, showTechDropdown, exportModalVisible, exporting, entryModalVisible, detailEntry, clipboard, selection, paintColor]);

  // When a day's summary opens, load that site's location + access info
  useEffect(() => {
    setDetailSite(null);
    if (!detailEntry) return;
    const siteId = detailEntry.site_id
      ?? sites.find(st => st.name.trim().toLowerCase() === (detailEntry.mine_name ?? '').trim().toLowerCase())?.id;
    if (!siteId) return;
    let cancelled = false;
    supabase.from('site_details').select('address, access_info').eq('site_id', siteId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setDetailSite(data ?? null); });
    return () => { cancelled = true; };
  }, [detailEntry?.id, detailEntry?.site_id]);

  // Ctrl+F / Cmd+F opens the site search (web only; not for technicians)
  useEffect(() => {
    if (Platform.OS !== 'web' || role === 'technician') return;
    const doc: any = (globalThis as any).document;
    if (!doc) return;
    const onKey = (e: any) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'f') {
        e.preventDefault();
        setShowSearch(true);
      } else if (e.key === 'Escape') {
        setShowSearch(false);
      }
    };
    doc.addEventListener('keydown', onKey);
    return () => doc.removeEventListener('keydown', onKey);
  }, [role]);

  // Search every technician's calendar for a site name (debounced)
  useEffect(() => {
    if (!showSearch) return;
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchRows([]); setSearchCapped(false); setSearchLoading(false); return; }
    let cancelled = false;
    setSearchLoading(true);
    const t = setTimeout(async () => {
      const safe = q.replace(/[\\%_,()]/g, ' ');
      let query = supabase
        .from('operational_calendar_entries')
        .select('id, technician_id, entry_date, mine_name, testing_type, tam_status, technician:technician_id(full_name)')
        .ilike('mine_name', `%${safe}%`)
        .order('entry_date', { ascending: true })
        .limit(600);
      if (searchScope === 'upcoming') {
        const n = new Date();
        const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
        query = query.gte('entry_date', today);
      }
      const { data, error } = await query;
      if (cancelled) return;
      setSearchLoading(false);
      if (error) { notify('Search failed', error.message); return; }
      setSearchRows(((data as any) ?? []).map((r: any) => ({
        ...r,
        technician: r.technician?.full_name
          ? r.technician
          : { full_name: liveRef.current.techNames[r.technician_id] ?? null },
      })));
      setSearchCapped((data?.length ?? 0) >= 600);
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [searchQuery, searchScope, showSearch]);

  function openSearchResult(r: SearchRange) {
    setSelection(null);
    setClipboard(null);
    const d = new Date(r.start + 'T00:00:00');
    setViewDate({ year: d.getFullYear(), month: d.getMonth() });
    setSelectedTechnicianId(r.techId);
    setShowSearch(false);
  }

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
      // Only the two branches the calendar is organised by
      const { data: allBranches } = await supabase.from('branches').select('id, name').order('name');
      const wanted = (allBranches ?? []).filter((b: any) => {
        const n = String(b.name).trim().toLowerCase();
        return n.startsWith('field service') || n.startsWith('head office');
      });
      setBranchOptions(wanted);

      // Technicians + any admin/HR switched on for "Has their own Operational Calendar".
      // Done in the database (security definer) because an admin can't read other admins' profiles directly.
      let people: Technician[] | null = null;
      const { data: rpcPeople, error: rpcError } = await supabase.rpc('get_calendar_people');
      if (!rpcError && rpcPeople) {
        people = rpcPeople as Technician[];
      } else {
        const { data: techs } = await supabase
          .from('profiles')
          .select('id, full_name, branch_id')
          .eq('role', 'technician')
          .order('full_name');
        people = techs ?? [];
      }
      setTechnicians(people);
      // Open on your own calendar if you have one, otherwise the first person
      setSelectedTechnicianId(prev => prev ?? people!.find(t => t.id === uid)?.id ?? people![0]?.id ?? null);
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

  // How many highlighted days actually hold an entry (what Delete would remove),
  // and whether Copy makes sense (first highlighted day has an entry + more days).
  const selectedEntryCount = selection ? selection.dates.filter(d => !!entriesByDate[d]).length : 0;
  const canCopySelection = !!selection && !!entriesByDate[selection.sourceDate] && selection.dates.length > 1;

  // Keep the live ref in sync every render so gesture handlers (bound
  // once) always see current data.
  liveRef.current.canEdit = canEdit;
  liveRef.current.selection = selection;
  liveRef.current.clipboard = clipboard;
  liveRef.current.pasteAt = pasteAt;
  liveRef.current.weeks = weeks;
  liveRef.current.cellWidth = cellWidth;
  liveRef.current.rowHeight = rowHeight;
  liveRef.current.entriesByDate = entriesByDate;
  liveRef.current.selectedTechnicianId = selectedTechnicianId;
  liveRef.current.paintColor = paintColor;
  liveRef.current.leaveDays = leaveDays;
  liveRef.current.techNames = Object.fromEntries(technicians.map(t => [t.id, t.full_name]));

  function goToToday() {
    setSelection(null);
    const now = new Date();
    setViewDate({ year: now.getFullYear(), month: now.getMonth() });
  }
  function stepZoom(dir: 1 | -1) {
    const i = ZOOM_STEPS.indexOf(zoom);
    setZoom(ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, i + dir))]);
  }

  function goToPreviousMonth() {
    setSelection(null);
    setViewDate(prev => (prev.month === 0 ? { year: prev.year - 1, month: 11 } : { year: prev.year, month: prev.month - 1 }));
  }
  function goToNextMonth() {
    setSelection(null);
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

  function buildEntryRow(src: CalendarEntry, entry_date: string, technicianId: string, uid: string | undefined) {
    return {
      technician_id: technicianId,
      entry_date,
      mine_name: src.mine_name,
      site_id: src.site_id,
      contact_person: src.contact_person,
      contact_number: src.contact_number,
      comments: src.comments,
      testing_type: src.testing_type,
      tam_status: src.tam_status,
      financial_document_type: COPY_FINANCIAL_DOC_ON_FILL ? src.financial_document_type : null,
      financial_document_number: COPY_FINANCIAL_DOC_ON_FILL ? src.financial_document_number : null,
      sales_order_number: COPY_FINANCIAL_DOC_ON_FILL ? src.sales_order_number : null,
      updated_by: uid,
      created_by: uid,
    };
  }

  async function performFillSave(sourceEntry: CalendarEntry, targetDates: string[]) {
    const technicianId = liveRef.current.selectedTechnicianId;
    if (!technicianId) return;
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;

    const rows = targetDates.map(entry_date => buildEntryRow(sourceEntry, entry_date, technicianId, uid));

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

  // Copies the first highlighted day's entry onto the other highlighted days.
  function copySelection() {
    if (!selection) return;
    const sourceEntry = entriesByDate[selection.sourceDate];
    if (!sourceEntry) return;
    const targetDates = selection.dates.filter(d => d !== selection.sourceDate);
    if (targetDates.length === 0) return;

    const overlapping = targetDates.filter(d => !!entriesByDate[d]);
    const apply = async () => {
      await performFillSave(sourceEntry, targetDates);
      setSelection(null);
    };

    if (overlapping.length > 0) {
      confirm(
        'Overwrite existing entries?',
        `${overlapping.length} day${overlapping.length === 1 ? '' : 's'} in this range already ${overlapping.length === 1 ? 'has' : 'have'} an entry. Copying will replace ${overlapping.length === 1 ? 'it' : 'them'}.`,
        apply
      );
    } else {
      apply();
    }
  }

  // Picks up ONLY the highlighted days that hold an entry. mode 'move' removes
  // them from where they were once pasted.
  function pickUpSelection(mode: 'copy' | 'move') {
    const technicianId = liveRef.current.selectedTechnicianId;
    if (!selection || !technicianId) return;
    const dates = selection.dates.filter(d => !!entriesByDate[d]).sort();
    if (dates.length === 0) return;
    setClipboard({
      mode,
      sourceTechId: technicianId,
      items: dates.map(d => ({ offset: diffDays(dates[0], d), entry: entriesByDate[d] })),
    });
    setSelection(null);
  }

  // Tap a day while something is picked up: it is pasted there, with the first
  // picked-up entry landing on the tapped day and the rest keeping their spacing.
  function pasteAt(targetDate: string) {
    const cb = liveRef.current.clipboard;
    const technicianId = liveRef.current.selectedTechnicianId;
    if (!cb || !technicianId) return;

    const targets = cb.items.map(it => ({ date: addDaysStr(targetDate, it.offset), entry: it.entry }));
    const sourceIds = new Set(cb.items.map(it => it.entry.id));
    const existing = liveRef.current.entriesByDate;
    const overlapping = targets.filter(t => {
      const ex = existing[t.date];
      // moving onto your own source cells isn't an overwrite
      return !!ex && !(cb.sourceTechId === technicianId && sourceIds.has(ex.id));
    });

    const apply = async () => {
      setSaving(true);
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      const rows = targets.map(t => buildEntryRow(t.entry, t.date, technicianId, uid));
      const { error } = await supabase
        .from('operational_calendar_entries')
        .upsert(rows, { onConflict: 'technician_id,entry_date' });
      if (error) {
        setSaving(false);
        notify('Error', error.message);
        return;
      }

      if (cb.mode === 'move') {
        const targetDates = new Set(targets.map(t => t.date));
        // Source days that were pasted over are already replaced; delete the rest.
        const toDelete = cb.items
          .filter(it => cb.sourceTechId !== technicianId || !targetDates.has(it.entry.entry_date))
          .map(it => it.entry.id);
        if (toDelete.length > 0) {
          const { error: delErr } = await supabase.from('operational_calendar_entries').delete().in('id', toDelete);
          if (delErr) notify('Error', delErr.message);
        }
        setClipboard(null);
      }
      setSaving(false);
      fetchEntries(technicianId);
    };

    if (overlapping.length > 0) {
      confirm(
        'Overwrite existing entries?',
        `${overlapping.length} day${overlapping.length === 1 ? '' : 's'} already ${overlapping.length === 1 ? 'has' : 'have'} an entry. Pasting will replace ${overlapping.length === 1 ? 'it' : 'them'}.`,
        apply
      );
    } else {
      apply();
    }
  }

  // Tap a day to add it to / remove it from the highlighted days
  // (this is how you pick days that aren't next to each other).
  function toggleSelected(dateStr: string) {
    const cur = liveRef.current.selection;
    if (!cur) {
      setSelection({ sourceDate: dateStr, dates: [dateStr] });
      return;
    }
    const has = cur.dates.includes(dateStr);
    const dates = has ? cur.dates.filter(d => d !== dateStr) : [...cur.dates, dateStr];
    if (dates.length === 0) {
      setSelection(null);
      return;
    }
    setSelection({ sourceDate: dates.includes(cur.sourceDate) ? cur.sourceDate : [...dates].sort()[0], dates });
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

  // Deletes every entry on the highlighted days (after a confirmation).
  function deleteSelection() {
    if (!selection) return;
    const targets = selection.dates.filter(d => !!entriesByDate[d]);
    if (targets.length === 0) return;
    confirm(
      'Delete Entries',
      `Delete ${targets.length} entr${targets.length === 1 ? 'y' : 'ies'}? This can't be undone.`,
      async () => {
        await deleteEntriesForDates(targets);
        setSelection(null);
      }
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

        // Press & hold on any day starts highlighting; drag to extend the range.
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = setTimeout(() => {
          if (!startDate) return;
          const info: DragInfo = { type: 'select', sourceDate: startDate, dates: [startDate] };
          dragInfoRef.current = info;
          setDragInfo(info);
          setIsDragging(true);
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

        const dates = rectDates(liveRef.current.weeks, current.sourceDate, dateStr);
        const next: DragInfo = { ...current, dates };
        dragInfoRef.current = next;
        setDragInfo(next);
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
          if (info.type === 'paint') savePaint(info.color, info.dates);
          else {
            // Add the dragged block to whatever is already highlighted
            const prev = liveRef.current.selection;
            const merged = prev ? Array.from(new Set([...prev.dates, ...info.dates])) : info.dates;
            setSelection({ sourceDate: prev?.sourceDate ?? info.sourceDate, dates: merged });
          }
        } else if (touchStartDateRef.current) {
          const tapped = touchStartDateRef.current;
          if (liveRef.current.clipboard) liveRef.current.pasteAt(tapped);   // paste where you tap
          else if (liveRef.current.selection) toggleSelected(tapped);       // add / remove this day
          else handleDayPress(tapped);
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
    setSalesOrderNumber('');
    setSelectedSiteId(null);
    setShowSiteDropdown(false);
    setSiteSearch('');
    setEntryModalVisible(true);
  }

  function openEditEntryModal(entry: CalendarEntry) {
    setEditingEntry(entry);
    setDateFrom(entry.entry_date);
    setDateTo(entry.entry_date);
    setSkipWeekends(false);
    setMineName(entry.mine_name ?? '');
    setContactPerson(entry.contact_person ?? '');
    setContactNumber(entry.contact_number ?? '');
    setComments(entry.comments ?? '');
    setTestingType(entry.testing_type);
    setTamStatus(entry.tam_status);
    setFinancialDocType(entry.financial_document_type);
    setFinancialDocNumber(entry.financial_document_number ?? '');
    setSalesOrderNumber(entry.sales_order_number ?? '');
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

  // The search text doesn't match an existing site exactly -> offer to add it
  const typedSiteName = siteSearch.trim();
  const canAddTypedSite =
    typedSiteName.length > 0 &&
    !sites.some(st => st.name.trim().toLowerCase() === typedSiteName.toLowerCase());

  // Adds a brand-new site straight from the calendar. It lands in the Sites
  // list automatically (same `sites` table), and is picked for this day.
  async function addSiteFromCalendar() {
    const name = typedSiteName;
    if (!name || addingSite) return;
    setAddingSite(true);

    let newId: string | null = null;
    const { data: rpcId, error: rpcError } = await supabase.rpc('create_site_from_calendar', { p_name: name });
    if (!rpcError && rpcId) {
      newId = rpcId as string;
    } else if (rpcError && !/function|PGRST202|schema cache/i.test(`${rpcError.code ?? ''} ${rpcError.message}`)) {
      setAddingSite(false);
      notify('Could not add site', rpcError.message);
      return;
    } else {
      // Function not installed yet - fall back to a direct insert (needs "manage sites")
      const { data: userData } = await supabase.auth.getUser();
      const { data: inserted, error } = await supabase
        .from('sites')
        .insert({ name, created_by: userData.user?.id })
        .select('id')
        .single();
      if (error) {
        setAddingSite(false);
        notify('Could not add site', error.message);
        return;
      }
      newId = inserted.id;
    }

    // Leave a trail in the site's activity log (best effort)
    const { data: me } = await supabase.auth.getUser();
    supabase.from('site_activity_log').insert({
      site_id: newId,
      actor_id: me.user?.id,
      action: 'added_site',
      description: `Site "${name}" added from the Operational Calendar`,
    }).then(() => {});

    await fetchSitesAndContacts();
    // Pick it for this day. Contact boxes are left alone - a new site has no contacts yet.
    setSelectedSiteId(newId);
    setMineName(name);
    setShowSiteDropdown(false);
    setSiteSearch('');
    setAddingSite(false);
  }

  // Removes the chosen site so the day becomes a note-only day.
  // Contact fields are left alone in case they were typed in by hand.
  function clearSite() {
    setSelectedSiteId(null);
    setMineName('');
    setShowSiteDropdown(false);
    setSiteSearch('');
  }

  async function handleSaveEntry() {
    // A site is optional now, but a day can't be completely empty:
    // it needs at least a site or a note.
    if (!mineName.trim() && !comments.trim()) {
      notify('Nothing to save', 'Add a site or a note.');
      return;
    }
    if (!dateFrom || !selectedTechnicianId) return;

    if (!editingEntry && dateTo < dateFrom) {
      notify('Invalid range', '"Date To" can\'t be before "Date From".');
      return;
    }

    const targetDates = editingEntry ? [dateFrom] : expandDateRange(dateFrom, dateTo, skipWeekends);

if (targetDates.length === 0) {
  notify('No days to fill', 'That range only contains weekend days. Turn off "Skip weekends" or pick other dates.');
  return;
}
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
  // type + numbers — those are the days that were "made from that" same
  // document (e.g. created together via a date range or a copy).
  // Days with a different document are a different job and are left
  // alone.
  async function updateRelatedFinancialDocs(
    dates: string[],
    type: string | null,
    number: string | null,
    salesOrder: string | null
  ) {
    if (!selectedTechnicianId || dates.length === 0) return;
    const { error } = await supabase
      .from('operational_calendar_entries')
      .update({
        financial_document_type: type,
        financial_document_number: number,
        sales_order_number: salesOrder,
      })
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
      mine_name: mineName.trim() || null,
      site_id: mineName.trim() ? selectedSiteId : null,
      contact_person: contactPerson.trim() || null,
      contact_number: contactNumber.trim() || null,
      comments: comments.trim() || null,
      testing_type: testingType,
      tam_status: tamStatus,
      financial_document_type: financialDocType,
      financial_document_number: financialDocNumber.trim() || null,
      // The sales order number is only kept alongside an Invoice.
      sales_order_number: financialDocType === 'Invoice' ? (salesOrderNumber.trim() || null) : null,
      updated_by: uid,
    };

    let error;
    let relatedDates: string[] = [];
    const newDocType = basePayload.financial_document_type;
    const newDocNumber = basePayload.financial_document_number;
    const newSO = basePayload.sales_order_number;

    if (editingEntry) {
      const oldDocType = editingEntry.financial_document_type;
      const oldDocNumber = editingEntry.financial_document_number;
      const oldSO = editingEntry.sales_order_number ?? null;
      const docChanged = oldDocType !== newDocType || oldDocNumber !== newDocNumber || oldSO !== newSO;

      // Only entries that had a real document before (not blank) can be
      // "related" to this one.
      if (docChanged && (oldDocNumber || oldSO)) {
        relatedDates = entries
          .filter(e =>
            e.id !== editingEntry.id &&
            e.technician_id === editingEntry.technician_id &&
            e.financial_document_type === oldDocType &&
            e.financial_document_number === oldDocNumber &&
            (e.sales_order_number ?? null) === oldSO
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
        () => updateRelatedFinancialDocs(relatedDates, newDocType, newDocNumber, newSO)
      );
    }
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
        {!compact && (
          <>
        <View style={[styles.header, isLandscape && styles.headerLandscape]}>
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft color={colors.yellow} size={24} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Operational Calendar</Text>
          <View style={styles.headerActions}>
            {role !== 'technician' && (
              <TouchableOpacity onPress={() => setShowSearch(true)} style={styles.headerIconBtn}>
                <Search color={colors.yellow} size={20} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setExportModalVisible(true)} style={styles.headerIconBtn}>
              <FileDown color={colors.yellow} size={20} />
            </TouchableOpacity>
          </View>
        </View>

        {role !== 'technician' && (
          <TouchableOpacity
            style={[styles.techPicker, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => { setPickerBranchId(null); setShowTechDropdown(true); }}
          >
            <User color={colors.yellow} size={16} />
            <Text style={[styles.techPickerText, { color: theme.text }]}>
              {selectedTechnician?.full_name ?? 'Select technician'}
            </Text>
            <ChevronDown color={theme.muted} size={16} />
          </TouchableOpacity>
        )}
          </>
        )}

        {/* Colours — open the key, pick a colour, then tap/drag over days */}
        {(!compact || paintColor) && (
        <View style={[styles.colourBar, compact && { marginTop: isLandscape ? 8 : 44 }]}>
          {!compact && (
          <TouchableOpacity
            onPress={() => setShowColourPanel(v => !v)}
            style={[styles.colourBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <Palette color={colors.yellow} size={16} />
            <Text style={[styles.colourBtnText, { color: theme.text }]}>Colours</Text>
            <ChevronDown color={theme.muted} size={16} />
          </TouchableOpacity>
          )}

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
        )}

        {!compact && showColourPanel && (
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
                  setSelection(null);
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
                  setSelection(null);
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

        {!compact && !canEdit && (
          <Text style={[styles.readOnlyNote, { color: theme.muted }]}>View only</Text>
        )}

        {!compact && canEdit && !paintColor && !selection && (
          <Text style={[styles.dragHint, { color: theme.subtext }]}>
            Tip: press & hold a day, drag across (down or diagonally) to highlight a block, then tap other days to add or remove them. Then copy, move or delete.
          </Text>
        )}

        {/* Something is picked up: tap a day to paste it there */}
        {canEdit && !paintColor && clipboard && (
          <View style={[styles.selectionBar, { backgroundColor: theme.card, borderColor: DRAG_FILL_BORDER }]}>
            <Text style={[styles.selectionText, { color: theme.text, minWidth: 180 }]}>
              {clipboard.mode === 'move' ? 'Moving' : 'Copied'} {clipboard.items.length} entr{clipboard.items.length === 1 ? 'y' : 'ies'} — tap the day the first one should go
              {clipboard.items.length > 1 ? ' (the rest keep their spacing)' : ''}
            </Text>
            <TouchableOpacity onPress={() => setClipboard(null)}>
              <Text style={styles.selectionCopy}>{clipboard.mode === 'move' ? 'Cancel' : 'Done'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Appears once days are highlighted: see what's selected, then copy, move or delete */}
        {canEdit && !paintColor && !clipboard && selection && (
          <View style={[styles.selectionBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.selectionText, { color: theme.text }]} numberOfLines={1}>
              {selection.dates.length} day{selection.dates.length === 1 ? '' : 's'} selected
            </Text>
            {selectedEntryCount > 0 && (
              <TouchableOpacity onPress={() => pickUpSelection('copy')}>
                <Text style={styles.selectionCopy}>Copy {selectedEntryCount}</Text>
              </TouchableOpacity>
            )}
            {selectedEntryCount > 0 && (
              <TouchableOpacity onPress={() => pickUpSelection('move')}>
                <Text style={styles.selectionCopy}>Move {selectedEntryCount}</Text>
              </TouchableOpacity>
            )}
            {canCopySelection && (
              <TouchableOpacity onPress={copySelection}>
                <Text style={styles.selectionCopy}>Fill</Text>
              </TouchableOpacity>
            )}
            {selectedEntryCount > 0 && (
              <TouchableOpacity onPress={deleteSelection} style={styles.selectionDeleteBtn}>
                <Trash2 color="#ef4444" size={14} />
                <Text style={styles.selectionDelete}>Delete {selectedEntryCount}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setSelection(null)}>
              <X color={theme.muted} size={18} />
            </TouchableOpacity>
          </View>
        )}

        {/* Month nav */}
        <View style={[styles.monthNavRow, { position: 'relative' }, compact && !paintColor && { paddingTop: isLandscape ? 14 : 48 }]}>
          <TouchableOpacity onPress={goToPreviousMonth} style={styles.monthNavBtn}>
            <ChevronLeft color={colors.yellow} size={22} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setPickerYear(viewDate.year); setShowMonthPicker(true); }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 160 }}
          >
            <Text style={[styles.monthNavLabel, { color: theme.text, minWidth: 0 }]}>
              {new Date(viewDate.year, viewDate.month, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}
            </Text>
            <ChevronDown color={theme.muted} size={16} />
          </TouchableOpacity>
          <TouchableOpacity onPress={goToNextMonth} style={styles.monthNavBtn}>
            <ChevronRight color={colors.yellow} size={22} />
          </TouchableOpacity>

          {/* X hides everything but the date changer; the tick brings it all back */}
          <TouchableOpacity
            onPress={() => setCompact(v => !v)}
            accessibilityLabel={compact ? 'Show toolbar' : 'Hide toolbar'}
            style={[
              styles.compactToggle,
              { borderColor: compact ? '#22c55e' : theme.border, backgroundColor: theme.card },
              compact && !paintColor && { top: isLandscape ? 14 : 48 },
            ]}
          >
            {compact ? <Check color="#22c55e" size={18} /> : <X color={theme.muted} size={18} />}
          </TouchableOpacity>
        </View>

        {/* Today + zoom */}
        {!compact && (
        <View style={styles.viewControlsRow}>
          <TouchableOpacity onPress={goToToday} style={[styles.viewPill, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <Text style={{ color: theme.text, fontSize: 12.5, fontWeight: '700' }}>Today</Text>
          </TouchableOpacity>
          <View style={[styles.viewPill, { borderColor: theme.border, backgroundColor: theme.card, gap: 10 }]}>
            <TouchableOpacity onPress={() => stepZoom(-1)} disabled={zoom === ZOOM_STEPS[0]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <ZoomOut color={zoom === ZOOM_STEPS[0] ? theme.muted : colors.yellow} size={18} />
            </TouchableOpacity>
            <Text style={{ color: theme.text, fontSize: 12.5, fontWeight: '700', minWidth: 36, textAlign: 'center' }}>{Math.round(zoom * 100)}%</Text>
            <TouchableOpacity onPress={() => stepZoom(1)} disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <ZoomIn color={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1] ? theme.muted : colors.yellow} size={18} />
            </TouchableOpacity>
          </View>
        </View>
        )}

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
                  // Greyed-out day from the neighbouring month
                  if (!dateStr) {
                    return (
                      <View
                        key={di}
                        style={[styles.dayCell, { width: cellWidth, height: rowHeight, backgroundColor: CELL_PAD_BG, borderColor: CELL_BORDER }]}
                      >
                        <Text style={[cs.dayNumber, { color: CELL_PAD_TEXT }]}>
                          {adjacentDayNumber(viewDate.year, viewDate.month, wi * 7 + di)}
                        </Text>
                      </View>
                    );
                  }
                  const entry = entriesByDate[dateStr];
                  const dayNum = parseInt(dateStr.split('-')[2], 10);

                  const isSelected =
                    (dragInfo?.type === 'select' && dragInfo.dates.includes(dateStr)) ||
                    !!selection?.dates.includes(dateStr);
                  const isDragSource =
                    (dragInfo?.type === 'select' && dragInfo.sourceDate === dateStr) ||
                    selection?.sourceDate === dateStr;
                  const paintPreview = dragInfo?.type === 'paint' && dragInfo.dates.includes(dateStr) ? dragInfo.color : null;
                  const savedColour = highlights[dateStr] ? COLOUR_HEX[highlights[dateStr]] : undefined;
                  const cellColour = paintPreview
                    ? (paintPreview === 'erase' ? undefined : COLOUR_HEX[paintPreview])
                    : savedColour;

                  // Empty Saturdays/Sundays are greyed out (same as the PDF).
                  // Anything on the day - an entry, a colour, or approved
                  // leave - makes it a normal white cell again.
                  // South African public holidays show their name by default, on the
                  // grey "Public holiday" colour (unless a colour was painted on the day).
                  const holidayName = getHolidayName(dateStr);
                  const bgColour = cellColour ?? (holidayName ? COLOUR_HEX.grey : undefined);
                  const isEmptyWeekend =
                    (di === 0 || di === 6) && !entry && !bgColour && leaveDays[dateStr] === undefined;

                  return (
                    <TouchableOpacity
                      key={di}
                      activeOpacity={canEdit ? 1 : 0.7}
                      onPress={canEdit ? undefined : () => handleDayPress(dateStr)}
                      style={[
                        styles.dayCell,
                        { width: cellWidth, height: rowHeight, backgroundColor: isEmptyWeekend ? WEEKEND_BG : getCellBackground(bgColour), borderColor: CELL_BORDER },
                        isSelected && !isDragSource && styles.dayCellFillHighlight,
                        isDragSource && styles.dayCellDragSource,
                      ]}
                    >
                      <Text style={[cs.dayNumber, isEmptyWeekend && { color: '#64748b' }]}>{dayNum}</Text>

                      {!!holidayName && (
                        <Text style={cs.cellHolidayName} numberOfLines={2}>{holidayName}</Text>
                      )}

                      {leaveDays[dateStr] !== undefined && (
                        <View style={cs.cellLeaveBadge}>
                          <Text style={cs.cellLeaveTitle}>LEAVE</Text>
                          {!!leaveDays[dateStr] && (
                            <Text style={cs.cellLeaveType} numberOfLines={2}>
                              {leaveDays[dateStr]}
                            </Text>
                          )}
                        </View>
                      )}

                      {entry && (
                        <View style={cs.dayCellContent}>
                          {!!entry.mine_name && (
                            <Text
                              style={[cs.cellMineName, { fontSize: Math.round(titleFontSize(entry.mine_name) * zoom * 10) / 10, lineHeight: Math.round(titleFontSize(entry.mine_name) * zoom * 1.2) }]}
                              numberOfLines={3}
                              adjustsFontSizeToFit
                              minimumFontScale={0.7}
                            >
                              {entry.mine_name}
                            </Text>
                          )}
                          {entry.contact_person && (
                            <Text style={cs.cellSubText} numberOfLines={2}>
                              {entry.contact_person}
                            </Text>
                          )}
                          {entry.contact_number && (
                            <Text style={cs.cellSubText} numberOfLines={2}>
                              {entry.contact_number}
                            </Text>
                          )}
                          {entry.comments && (
                            <View style={cs.cellCommentBox}>
                              <Text style={cs.cellCommentText} numberOfLines={entry.mine_name ? 2 : 6}>
                                {entry.comments}
                              </Text>
                            </View>
                          )}
                          {entry.testing_type && (
                            <View style={[cs.cellPill, { backgroundColor: optionColour(entry.testing_type) }]}>
                              <Text style={[cs.cellPillText, { color: '#ffffff' }]} numberOfLines={1}>
                                {entry.testing_type}
                              </Text>
                            </View>
                          )}
                          {entry.tam_status && (
                            <View style={[cs.cellPill, { backgroundColor: optionColour(entry.tam_status) }]}>
                              <Text style={[cs.cellPillText, { color: '#ffffff' }]} numberOfLines={1}>
                                {entry.tam_status}
                              </Text>
                            </View>
                          )}
                          {(() => {
                            const docs = financialDocParts(
                              entry.financial_document_type,
                              entry.financial_document_number,
                              entry.sales_order_number
                            );
                            if (docs.length === 0) return null;
                            // Sales Order + Invoice on one centred line: "SO 234   INV 344"
                            return (
                              <Text
                                style={[cs.cellInvoiceText, docs.length > 1 && cs.cellInvoiceTextSide]}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.6}
                              >
                                {docs.map(p => `${p.abbr} ${p.value}`.trim()).join('   ')}
                              </Text>
                            );
                          })()}
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

      {/* Site search - every technician at once */}
      <Modal visible={showSearch} transparent animationType="fade" onRequestClose={() => setShowSearch(false)}>
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerSheet, { backgroundColor: theme.card, borderColor: theme.border, maxWidth: 680, height: '85%' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.input, borderRadius: 10, paddingHorizontal: 10 }}>
                <Search color={theme.muted} size={16} />
                <TextInput
                  autoFocus
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search a site (e.g. Redpath)…"
                  placeholderTextColor={theme.muted}
                  style={{ flex: 1, color: theme.text, paddingVertical: 10, fontSize: 15 }}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <X color={theme.muted} size={16} />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity onPress={() => setShowSearch(false)}>
                <Text style={{ color: colors.yellow, fontWeight: '700', fontSize: 14 }}>Close</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {(['upcoming', 'all'] as const).map(sc => (
                <TouchableOpacity
                  key={sc}
                  onPress={() => setSearchScope(sc)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
                    borderColor: searchScope === sc ? colors.yellow : theme.border,
                    backgroundColor: searchScope === sc ? `${colors.yellow}20` : 'transparent',
                  }}
                >
                  <Text style={{ color: searchScope === sc ? colors.yellow : theme.subtext, fontSize: 12.5, fontWeight: '700' }}>
                    {sc === 'upcoming' ? 'Upcoming' : 'All dates'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
              {searchQuery.trim().length < 2 ? (
                <Text style={{ color: theme.subtext, padding: 12 }}>Type at least 2 letters of a site name to see every technician booked there.</Text>
              ) : searchLoading ? (
                <ActivityIndicator color={colors.yellow} style={{ marginTop: 24 }} />
              ) : searchRows.length === 0 ? (
                <Text style={{ color: theme.subtext, padding: 12 }}>
                  No {searchScope === 'upcoming' ? 'upcoming ' : ''}entries found for “{searchQuery.trim()}”.
                </Text>
              ) : (
                (() => {
                  const n = new Date();
                  const todayLocal = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
                  return buildSearchGroups(searchRows).map(g => (
                  <View key={g.key} style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: colors.yellow }}>
                      <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800', flex: 1 }} numberOfLines={1}>{g.site}</Text>
                      <Text style={{ color: theme.subtext, fontSize: 12, fontWeight: '600' }}>
                        {g.dayCount} day{g.dayCount === 1 ? '' : 's'} · {g.techCount} technician{g.techCount === 1 ? '' : 's'}
                      </Text>
                    </View>
                    {g.ranges.map((r, i) => {
                      const isPast = r.end < todayLocal;
                      return (
                        <TouchableOpacity
                          key={`${r.techId}-${r.start}-${i}`}
                          onPress={() => openSearchResult(r)}
                          style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: theme.border, opacity: isPast ? 0.55 : 1 }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: '700', flexShrink: 1 }}>
                              {formatRangeLabel(r.start, r.end)}
                            </Text>
                            {r.days > 1 && (
                              <Text style={{ color: theme.subtext, fontSize: 11.5, fontWeight: '600' }}>{r.days} days</Text>
                            )}
                          </View>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <Text style={{ color: colors.yellow, fontSize: 13, fontWeight: '700' }}>{r.techName}</Text>
                            {!!r.testing && (
                              <View style={{ backgroundColor: optionColour(r.testing), borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                                <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}>{r.testing}</Text>
                              </View>
                            )}
                            {!!r.tam && (
                              <View style={{ backgroundColor: optionColour(r.tam), borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                                <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}>{r.tam}</Text>
                              </View>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  ));
                })()
              )}
              {searchCapped && (
                <Text style={{ color: theme.subtext, fontSize: 12, padding: 8 }}>Showing the first 600 matches — type more of the site name to narrow it down.</Text>
              )}
            </ScrollView>
            <Text style={{ color: theme.muted, fontSize: 11.5, marginTop: 8 }}>Tap a result to jump to that technician and month.</Text>
          </View>
        </View>
      </Modal>

      {/* Jump to any month / year */}
      <Modal visible={showMonthPicker} transparent animationType="fade" onRequestClose={() => setShowMonthPicker(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowMonthPicker(false)}>
          <View style={[styles.pickerSheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <TouchableOpacity onPress={() => setPickerYear(y => y - 1)} style={styles.monthNavBtn}>
                <ChevronLeft color={colors.yellow} size={22} />
              </TouchableOpacity>
              <Text style={[styles.pickerTitle, { color: theme.text, marginBottom: 0 }]}>{pickerYear}</Text>
              <TouchableOpacity onPress={() => setPickerYear(y => y + 1)} style={styles.monthNavBtn}>
                <ChevronRight color={colors.yellow} size={22} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {Array.from({ length: 12 }, (_, m) => {
                const isCurrent = viewDate.year === pickerYear && viewDate.month === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={{
                      width: '31%', paddingVertical: 14, borderRadius: 10, borderWidth: 1, alignItems: 'center',
                      borderColor: isCurrent ? colors.yellow : theme.border,
                      backgroundColor: isCurrent ? `${colors.yellow}20` : theme.input,
                    }}
                    onPress={() => {
                      setSelection(null);
                      setViewDate({ year: pickerYear, month: m });
                      setShowMonthPicker(false);
                    }}
                  >
                    <Text style={{ color: isCurrent ? colors.yellow : theme.text, fontWeight: '700', fontSize: 14 }}>
                      {new Date(pickerYear, m, 1).toLocaleDateString('en-ZA', { month: 'short' })}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Technician picker modal */}
      <Modal visible={showTechDropdown} transparent animationType="fade" onRequestClose={() => setShowTechDropdown(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowTechDropdown(false)}>
          <View style={[styles.pickerSheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {(() => {
              // No Field Service / Head Office branches set up yet -> plain technician list
              const useBranches = branchOptions.length > 0;
              const inBranch = (t: Technician) =>
                pickerBranchId === UNASSIGNED_BRANCH
                  ? !t.branch_id || !branchOptions.some(bo => bo.id === t.branch_id)
                  : t.branch_id === pickerBranchId;
              const unassignedCount = technicians.filter(t => !t.branch_id || !branchOptions.some(bo => bo.id === t.branch_id)).length;
              const showingTechs = !useBranches || pickerBranchId !== null;
              const list = !useBranches ? technicians : technicians.filter(inBranch);
              const branchTitle = pickerBranchId === UNASSIGNED_BRANCH
                ? 'No branch'
                : branchOptions.find(bo => bo.id === pickerBranchId)?.name;

              return (
                <>
                  {showingTechs ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                      {useBranches && (
                        <TouchableOpacity onPress={() => setPickerBranchId(null)} style={{ paddingRight: 10 }}>
                          <Text style={{ color: colors.yellow, fontSize: 14, fontWeight: '700' }}>‹ Branches</Text>
                        </TouchableOpacity>
                      )}
                      <Text style={[styles.pickerTitle, { color: theme.text, marginBottom: 0 }]}>
                        {useBranches ? branchTitle : 'Select Technician'}
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.pickerTitle, { color: theme.text }]}>Select Branch</Text>
                  )}
                  <ScrollView style={{ maxHeight: 360 }}>
                    {!showingTechs ? (
                      <>
                        {branchOptions.map(bo => (
                          <TouchableOpacity
                            key={bo.id}
                            style={[styles.dropdownItem, { borderBottomColor: theme.border }]}
                            onPress={() => setPickerBranchId(bo.id)}
                          >
                            <Text style={[styles.dropdownItemText, { color: theme.text }]}>
                              {bo.name}  ({technicians.filter(t => t.branch_id === bo.id).length})
                            </Text>
                          </TouchableOpacity>
                        ))}
                        {unassignedCount > 0 && (
                          <TouchableOpacity
                            style={[styles.dropdownItem, { borderBottomColor: theme.border }]}
                            onPress={() => setPickerBranchId(UNASSIGNED_BRANCH)}
                          >
                            <Text style={[styles.dropdownItemText, { color: theme.subtext }]}>No branch  ({unassignedCount})</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    ) : list.length === 0 ? (
                      <Text style={{ color: theme.subtext, padding: 14 }}>No technicians in this branch.</Text>
                    ) : (
                      list.map(t => (
                        <TouchableOpacity
                          key={t.id}
                          style={[styles.dropdownItem, { borderBottomColor: theme.border }, selectedTechnicianId === t.id && { backgroundColor: `${colors.yellow}20` }]}
                          onPress={() => { setSelection(null); setSelectedTechnicianId(t.id); setShowTechDropdown(false); }}
                        >
                          <Text style={[styles.dropdownItemText, { color: selectedTechnicianId === t.id ? colors.yellow : theme.text }]}>{t.full_name}</Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>
                </>
              );
            })()}
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

                {!!detailEntry.mine_name && (
                  <Text style={[styles.mineName, { color: theme.text }]}>{detailEntry.mine_name}</Text>
                )}

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

                {!!detailSite?.address && (
                  <TouchableOpacity
                    onPress={() => Linking.openURL(mapsUrlFor(detailSite.address as string))}
                    style={[styles.metaItem, { marginTop: 8, alignItems: 'flex-start' }]}
                  >
                    <MapPin color={colors.yellow} size={14} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.yellow, fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' }}>
                        Open in Google Maps
                      </Text>
                      {!isUrl(detailSite.address) && (
                        <Text style={[styles.metaText, { color: theme.subtext }]}>{detailSite.address}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                )}

                {!!detailSite?.access_info && (
                  <View style={[styles.metaItem, { marginTop: 8, alignItems: 'flex-start' }]}>
                    <Key color={theme.subtext} size={14} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.subtext, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>ACCESS INFO</Text>
                      <Text style={[styles.metaText, { color: theme.text }]}>{detailSite.access_info}</Text>
                    </View>
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
                    <View style={[styles.pill, { backgroundColor: optionColour(detailEntry.testing_type) }]}>
                      <Text style={[styles.pillText, { color: '#ffffff' }]}>{detailEntry.testing_type}</Text>
                    </View>
                  )}
                  {detailEntry.tam_status && (
                    <View style={[styles.pill, { backgroundColor: optionColour(detailEntry.tam_status) }]}>
                      <Text style={[styles.pillText, { color: '#ffffff' }]}>{detailEntry.tam_status}</Text>
                    </View>
                  )}
                </View>

                {financialDocParts(
                  detailEntry.financial_document_type,
                  detailEntry.financial_document_number,
                  detailEntry.sales_order_number
                ).map(p => (
                  <Text key={p.abbr + p.value} style={styles.invoiceText}>
                    {p.label}: {p.value}
                  </Text>
                ))}

                {canEdit && (
                  <View style={styles.entryActionsRow}>
                    <TouchableOpacity onPress={() => openEditEntryModal(detailEntry)}>
                      <Text style={{ color: colors.yellow, fontWeight: '700', fontSize: 13 }}>Edit</Text>
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
  <>
    <TouchableOpacity
      onPress={() => setSkipWeekends(v => !v)}
      activeOpacity={0.7}
      style={styles.weekendToggleRow}
    >
      <View
        style={[
          styles.weekendCheckbox,
          { borderColor: skipWeekends ? colors.yellow : theme.border, backgroundColor: skipWeekends ? colors.yellow : 'transparent' },
        ]}
      >
        {skipWeekends && <Check color={colors.black} size={14} />}
      </View>
      <Text style={[styles.weekendToggleText, { color: theme.text }]}>Skip weekends (Sat & Sun)</Text>
    </TouchableOpacity>

    <Text style={[styles.rangeHint, { color: theme.subtext, marginTop: 0 }]}>
      This will fill {expandDateRange(dateFrom, dateTo, skipWeekends).length} day
      {expandDateRange(dateFrom, dateTo, skipWeekends).length === 1 ? '' : 's'} from {dateFrom} to {dateTo}
      {skipWeekends ? ' (weekends skipped)' : ''}.
    </Text>
  </>
)}

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>SITE (OPTIONAL)</Text>
              <TouchableOpacity
                style={[styles.dropdownBtn, { backgroundColor: theme.input, borderColor: theme.border }]}
                onPress={() => setShowSiteDropdown(v => !v)}
              >
                <Text
                  style={[styles.dropdownBtnText, { color: mineName ? theme.text : theme.subtext }]}
                  numberOfLines={1}
                >
                  {mineName || 'No site (note only)'}
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
                    {!!mineName && (
                      <TouchableOpacity
                        style={[styles.dropdownItem, { borderBottomColor: theme.border }]}
                        onPress={clearSite}
                      >
                        <Text style={[styles.dropdownItemText, { color: '#ef4444' }]}>No site (clear)</Text>
                      </TouchableOpacity>
                    )}
                    {canAddTypedSite && (
                      <TouchableOpacity
                        style={[styles.dropdownItem, { borderBottomColor: theme.border, backgroundColor: `${colors.yellow}15` }]}
                        onPress={addSiteFromCalendar}
                        disabled={addingSite}
                      >
                        <Text style={[styles.dropdownItemText, { color: colors.yellow, fontWeight: '700' }]}>
                          {addingSite ? 'Adding…' : `+ Add “${typedSiteName}” as a new site`}
                        </Text>
                        <Text style={[styles.dropdownItemSub, { color: theme.subtext }]}>
                          It will also appear on the Sites screen
                        </Text>
                      </TouchableOpacity>
                    )}
                    {filteredSites.length === 0 ? (
                      <Text style={[styles.dropdownItemSub, { color: theme.subtext, padding: 14 }]}>
                        {sites.length === 0 ? 'No sites yet. Type a name above to add the first one.' : canAddTypedSite ? 'No existing site matches that.' : 'No sites match that search.'}
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
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.fieldLabel, { color: theme.subtext }]}>TESTING TYPE</Text>
                {testingType ? (
                  <TouchableOpacity onPress={() => { setTestingType(null); setShowTestingTypeDropdown(false); }} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
                    <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '700' }}>Clear</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
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
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: optionColour(opt) }} />
                        <Text style={[styles.dropdownItemText, { color: testingType === opt ? colors.yellow : theme.text }]}>{opt}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.fieldGroup}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.fieldLabel, { color: theme.subtext }]}>TAM STATUS</Text>
                {tamStatus ? (
                  <TouchableOpacity onPress={() => { setTamStatus(null); setShowTamStatusDropdown(false); }} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
                    <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '700' }}>Clear</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
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
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: optionColour(opt) }} />
                        <Text style={[styles.dropdownItemText, { color: tamStatus === opt ? colors.yellow : theme.text }]}>{opt}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.fieldGroup}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.fieldLabel, { color: theme.subtext }]}>FINANCIAL DOCUMENT</Text>
                {(financialDocType || financialDocNumber || salesOrderNumber) ? (
                  <TouchableOpacity onPress={() => { setFinancialDocType(null); setFinancialDocNumber(''); setSalesOrderNumber(''); setShowFinancialDocDropdown(false); }} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
                    <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '700' }}>Clear</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
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
                      onPress={() => {
                        // Sales Order becoming an Invoice: keep the SO number alongside
                        // and leave the number field free for the new invoice number.
                        if (
                          opt === 'Invoice' &&
                          financialDocType === 'Sales Order' &&
                          financialDocNumber.trim() &&
                          !salesOrderNumber.trim()
                        ) {
                          setSalesOrderNumber(financialDocNumber.trim());
                          setFinancialDocNumber('');
                        }
                        setFinancialDocType(opt);
                        setShowFinancialDocDropdown(false);
                      }}
                    >
                      <Text style={[styles.dropdownItemText, { color: financialDocType === opt ? colors.yellow : theme.text }]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {financialDocType === 'Invoice' && (
                <TextInput
                  style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text, marginTop: 8 }]}
                  placeholder="Sales order it came from, e.g. SO 16617"
                  placeholderTextColor={theme.muted}
                  value={salesOrderNumber}
                  onChangeText={setSalesOrderNumber}
                />
              )}
              <TextInput
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text, marginTop: 8 }]}
                placeholder={financialDocPlaceholder(financialDocType)}
                placeholderTextColor={theme.muted}
                value={financialDocNumber}
                onChangeText={setFinancialDocNumber}
              />
              {editingEntry &&
                editingEntry.financial_document_type &&
                editingEntry.financial_document_number &&
                (financialDocType !== editingEntry.financial_document_type ||
                  financialDocNumber.trim() !== (editingEntry.financial_document_number ?? '') ||
                  salesOrderNumber.trim() !== (editingEntry.sales_order_number ?? '')) && (
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
  headerIconBtn: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
  },
  techPicker: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 46,
    marginHorizontal: 16, marginBottom: 8,
  },
  techPickerText: { flex: 1, fontSize: 14, fontWeight: '600' },
  readOnlyNote: { fontSize: 12, fontStyle: 'italic', marginHorizontal: 16, marginBottom: 6 },
  dragHint: { fontSize: 11.5, fontStyle: 'italic', marginHorizontal: 16, marginBottom: 6 },
  selectionBar: {
    flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, minHeight: 44,
    marginHorizontal: 16, marginBottom: 8,
  },
  selectionText: { flex: 1, fontSize: 12.5, fontWeight: '600' },
  selectionCopy: { color: DRAG_FILL_BORDER, fontWeight: '700', fontSize: 13 },
  selectionDeleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  selectionDelete: { color: '#ef4444', fontWeight: '700', fontSize: 13 },
  weekendToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
weekendCheckbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
weekendToggleText: { fontSize: 14, fontWeight: '600' },
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
  cellHolidayName: { fontSize: 11, fontWeight: '800', color: '#1f2937', marginTop: 2 },
  cellLeaveTitle: { fontSize: 13, fontWeight: '800', color: '#5b21b6', letterSpacing: 0.6 },
  cellLeaveType: { fontSize: 12, fontWeight: '700', color: '#5b21b6', textAlign: 'center', marginTop: 1 },
  monthNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, paddingVertical: 8 },
  monthNavBtn: { padding: 8 },
  viewControlsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 12, marginBottom: 8 },
  viewPill: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  compactToggle: { position: 'absolute', right: 12, top: 6, width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  monthNavLabel: { fontSize: 16, fontWeight: '700', minWidth: 160, textAlign: 'center' },
  weekRow: { flexDirection: 'row' },
  weekdayHeaderCell: { paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  weekdayHeaderText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  dayCell: {
    borderWidth: 1, padding: 4, overflow: 'hidden',
  },
  dayCellFillHighlight: { borderWidth: 2, borderColor: DRAG_FILL_BORDER, backgroundColor: DRAG_FILL_TINT },
  dayCellDragSource: { borderWidth: 2, borderColor: DRAG_SOURCE_BORDER, backgroundColor: DRAG_FILL_TINT },
  dayCellContent: { marginTop: 4, gap: 6 },
  dayNumber: { fontSize: 18, fontWeight: '700', color: CELL_TEXT_DARK },
  cellMineName: { fontSize: 15.5, fontWeight: '700', lineHeight: 19, color: CELL_TEXT_DARK, textAlign: 'center' },
  cellSubText: { fontSize: 13, lineHeight: 16, color: CELL_SUBTEXT_DARK, textAlign: 'center' },
  cellCommentBox: {
    backgroundColor: COMMENT_BG, borderWidth: 1.5, borderColor: COMMENT_BORDER,
    borderRadius: 5, paddingHorizontal: 6, paddingVertical: 5, marginTop: 2,
  },
  cellCommentText: { fontSize: 13, fontWeight: '700', color: CELL_TEXT_DARK, textAlign: 'center', lineHeight: 16 },
  cellPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, marginTop: 2 },
  cellPillText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  cellInvoiceText: { fontSize: 13, fontWeight: '700', color: INVOICE_COLOR, marginTop: 4, textAlign: 'center' },
  cellInvoiceTextSide: { fontSize: 11 },
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

// Guarded entry point: the screen only opens while the "the Operational Calendar" switch is on for this user.
export default function OperationalCalendarScreen() {
  return (
    <RequirePermission permission="view_operational_calendar" name="the Operational Calendar">
      <OperationalCalendar />
    </RequirePermission>
  );
}