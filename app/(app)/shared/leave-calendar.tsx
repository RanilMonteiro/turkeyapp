import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator, Modal
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronDown, MapPin, User, Tag } from 'lucide-react-native';
import { Calendar } from 'react-native-calendars';
import { supabase } from '../../../lib/supabase';
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

const STATUS_COLORS: Record<string, string> = {
  approved: '#10b981',
  pending: '#f59e0b',
  in_review: '#3b82f6',
  declined: '#ef4444',
  cancelled: '#94a3b8',
};

type LeaveEntry = {
  submissionId: string;
  employeeId: string;
  employeeName: string;
  siteId: string | null;
  siteName: string | null;
  leaveType: string | null;
  status: string;
  fromDate: string;
  toDate: string;
};

type Site = { id: string; name: string };
type PersonOption = { id: string; full_name: string };

export default function LeaveCalendar() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';

  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<LeaveEntry[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<string[]>([]);

  // Filters
  const [filterSite, setFilterSite] = useState<string | null>(null);
  const [filterPerson, setFilterPerson] = useState<string | null>(null);
  const [filterLeaveType, setFilterLeaveType] = useState<string | null>(null);
  const [showSiteDropdown, setShowSiteDropdown] = useState(false);
  const [showPersonDropdown, setShowPersonDropdown] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    text: isDark ? colors.white : '#1e293b',
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    muted: isDark ? colors.gray[500] : colors.gray[400],
    input: isDark ? colors.gray[800] : colors.gray[50],
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

    const { data: siteData } = await supabase.from('sites').select('*').order('name');
    if (siteData) setSites(siteData);

    // Person list scope depends on role
    if (myRole === 'hr' || myRole === 'superuser') {
      const { data: everyone } = await supabase
        .from('profiles')
        .select('id, full_name')
        .neq('role', 'superuser')
        .order('full_name');
      if (everyone) setPeople(everyone);
    } else if (myRole === 'admin') {
      const { data: grants } = await supabase
        .from('leave_calendar_access_grants')
        .select('employee_id, employee:employee_id(id, full_name)')
        .eq('admin_id', uid);
      const grantedPeople = (grants ?? []).map((g: any) => g.employee).filter(Boolean);
      const { data: me } = await supabase.from('profiles').select('id, full_name').eq('id', uid).single();
      const combined = me ? [me, ...grantedPeople] : grantedPeople;
      setPeople(combined);
    }
    // technicians get no person list — they only ever see their own

    await fetchLeaveEntries(uid, myRole);
    setLoading(false);
  }

  async function fetchLeaveEntries(uid: string | null, myRole: string | null) {
    if (!uid || !myRole) return;

    // Leave templates are identified by category = 'leave'
    const { data: leaveTemplates } = await supabase
      .from('form_templates')
      .select('id, name')
      .eq('category', 'leave');

    if (!leaveTemplates || leaveTemplates.length === 0) {
      setEntries([]);
      return;
    }
    const templateIds = leaveTemplates.map(t => t.id);

    let query = supabase
      .from('form_submissions')
      .select('id, employee_id, status, form_data, template_id, employee:employee_id(full_name, site_id, sites(name))')
      .in('template_id', templateIds);

    // Technician: only their own. RLS also enforces this, but scoping
    // the query avoids relying solely on RLS for the UI's own logic.
    if (myRole === 'technician') {
      query = query.eq('employee_id', uid);
    }

    const { data: submissions } = await query;
    if (!submissions) { setEntries([]); return; }

    // Need each template's field ids for "from date" / "to date" / "type of leave"
    const { data: allFields } = await supabase
      .from('form_fields')
      .select('id, label, template_id')
      .in('template_id', templateIds);

    function findFieldId(templateId: string, matches: string[]): string | undefined {
      return allFields?.find(f =>
        f.template_id === templateId &&
        matches.some(m => f.label.toLowerCase().includes(m))
      )?.id;
    }

    const parsed: LeaveEntry[] = submissions.map((s: any) => {
      const fromFieldId = findFieldId(s.template_id, ['leave required from', 'from (date)', 'start date']);
      const toFieldId = findFieldId(s.template_id, ['leave required to', 'to (date)', 'end date']);
      const typeFieldId = findFieldId(s.template_id, ['type of leave']);

      return {
        submissionId: s.id,
        employeeId: s.employee_id,
        employeeName: s.employee?.full_name ?? 'Unknown',
        siteId: s.employee?.site_id ?? null,
        siteName: s.employee?.sites?.name ?? null,
        leaveType: typeFieldId ? s.form_data[typeFieldId] : null,
        status: s.status,
        fromDate: fromFieldId ? s.form_data[fromFieldId] : null,
        toDate: toFieldId ? s.form_data[toFieldId] : null,
      };
    }).filter(e => e.fromDate && e.toDate);

    setEntries(parsed);

    const types = Array.from(new Set(parsed.map(e => e.leaveType).filter(Boolean))) as string[];
    setLeaveTypes(types);
  }

  const filteredEntries = entries.filter(e => {
    if (filterSite && e.siteId !== filterSite) return false;
    if (filterPerson && e.employeeId !== filterPerson) return false;
    if (filterLeaveType && e.leaveType !== filterLeaveType) return false;
    return true;
  });

  // Build marked dates for the calendar — a dot per day a leave spans,
  // colored by status. Multiple leaves on one day get multiple dots.
 function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function expandDateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  let current = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  while (current <= end) {
    dates.push(toDateString(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

  const markedDates: Record<string, any> = {};
  filteredEntries.forEach(entry => {
    const dates = expandDateRange(entry.fromDate, entry.toDate);
    dates.forEach(date => {
      if (!markedDates[date]) markedDates[date] = { dots: [] };
      markedDates[date].dots.push({ color: STATUS_COLORS[entry.status] ?? colors.gray[400] });
    });
  });

  if (selectedDate) {
    markedDates[selectedDate] = {
      ...(markedDates[selectedDate] ?? {}),
      selected: true,
      selectedColor: `${colors.yellow}40`,
    };
  }

  const entriesForSelectedDate = selectedDate
    ? filteredEntries.filter(e => expandDateRange(e.fromDate, e.toDate).includes(selectedDate))
    : [];

  const showSiteFilter = role === 'hr' || role === 'superuser' || role === 'admin';
  const showPersonFilter = role === 'hr' || role === 'superuser' || role === 'admin';
  const showTypeFilter = role !== null; // everyone can filter by type, including technicians (their own leaves)

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
          <Text style={[styles.headerTitle, { color: theme.text }]}>Leave Calendar</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Filters */}
        <View style={styles.filterRow}>
          {showPersonFilter && (
            <TouchableOpacity
              style={[styles.filterChip, { backgroundColor: theme.card, borderColor: filterPerson ? colors.yellow : theme.border }]}
              onPress={() => setShowPersonDropdown(true)}
            >
              <User color={filterPerson ? colors.yellow : theme.subtext} size={14} />
              <Text style={[styles.filterChipText, { color: filterPerson ? colors.yellow : theme.subtext }]}>
                {filterPerson ? people.find(p => p.id === filterPerson)?.full_name ?? 'Person' : 'Everyone'}
              </Text>
            </TouchableOpacity>
          )}
          {showSiteFilter && (
            <TouchableOpacity
              style={[styles.filterChip, { backgroundColor: theme.card, borderColor: filterSite ? colors.yellow : theme.border }]}
              onPress={() => setShowSiteDropdown(true)}
            >
              <MapPin color={filterSite ? colors.yellow : theme.subtext} size={14} />
              <Text style={[styles.filterChipText, { color: filterSite ? colors.yellow : theme.subtext }]}>
                {filterSite ? sites.find(s => s.id === filterSite)?.name ?? 'Site' : 'All Sites'}
              </Text>
            </TouchableOpacity>
          )}
          {showTypeFilter && leaveTypes.length > 0 && (
            <TouchableOpacity
              style={[styles.filterChip, { backgroundColor: theme.card, borderColor: filterLeaveType ? colors.yellow : theme.border }]}
              onPress={() => setShowTypeDropdown(true)}
            >
              <Tag color={filterLeaveType ? colors.yellow : theme.subtext} size={14} />
              <Text style={[styles.filterChipText, { color: filterLeaveType ? colors.yellow : theme.subtext }]}>
                {filterLeaveType ?? 'All Types'}
              </Text>
            </TouchableOpacity>
          )}
          {(filterSite || filterPerson || filterLeaveType) && (
            <TouchableOpacity
              style={styles.clearFiltersBtn}
              onPress={() => { setFilterSite(null); setFilterPerson(null); setFilterLeaveType(null); }}
            >
              <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '600' }}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Legend */}
        <View style={styles.legendRow}>
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <View key={status} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={[styles.legendText, { color: theme.subtext }]}>{status.replace('_', ' ')}</Text>
            </View>
          ))}
        </View>

        {/* Calendar */}
        <View style={[styles.calendarCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Calendar
            markingType="multi-dot"
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
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
            {entriesForSelectedDate.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.muted }]}>No leave on this day.</Text>
            ) : (
              entriesForSelectedDate.map(entry => (
                <TouchableOpacity
                  key={entry.submissionId}
                  style={[styles.entryRow, { borderColor: theme.border }]}
                  onPress={() => router.push(`/(app)/hr/requests/${entry.submissionId}` as any)}
                >
                  <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[entry.status] ?? colors.gray[400] }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.entryName, { color: theme.text }]}>{entry.employeeName}</Text>
                    <Text style={[styles.entryMeta, { color: theme.subtext }]}>
                      {entry.leaveType ?? 'Leave'} {entry.siteName ? `· ${entry.siteName}` : ''}
                    </Text>
                    <Text style={[styles.entryDates, { color: theme.muted }]}>
                      {entry.fromDate} → {entry.toDate}
                    </Text>
                  </View>
                  <Text style={[styles.entryStatus, { color: STATUS_COLORS[entry.status] }]}>
                    {entry.status.replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Person picker */}
      <Modal visible={showPersonDropdown} transparent animationType="fade" onRequestClose={() => setShowPersonDropdown(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowPersonDropdown(false)}>
          <View style={[styles.pickerSheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.pickerTitle, { color: theme.text }]}>Filter by Person</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <TouchableOpacity style={[styles.dropdownItem, { borderBottomColor: theme.border }]} onPress={() => { setFilterPerson(null); setShowPersonDropdown(false); }}>
                <Text style={[styles.dropdownItemText, { color: theme.text }]}>Everyone</Text>
              </TouchableOpacity>
              {people.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.dropdownItem, { borderBottomColor: theme.border }, filterPerson === p.id && { backgroundColor: `${colors.yellow}20` }]}
                  onPress={() => { setFilterPerson(p.id); setShowPersonDropdown(false); }}
                >
                  <Text style={[styles.dropdownItemText, { color: filterPerson === p.id ? colors.yellow : theme.text }]}>{p.full_name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Site picker */}
      <Modal visible={showSiteDropdown} transparent animationType="fade" onRequestClose={() => setShowSiteDropdown(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowSiteDropdown(false)}>
          <View style={[styles.pickerSheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.pickerTitle, { color: theme.text }]}>Filter by Site</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <TouchableOpacity style={[styles.dropdownItem, { borderBottomColor: theme.border }]} onPress={() => { setFilterSite(null); setShowSiteDropdown(false); }}>
                <Text style={[styles.dropdownItemText, { color: theme.text }]}>All Sites</Text>
              </TouchableOpacity>
              {sites.map(s => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.dropdownItem, { borderBottomColor: theme.border }, filterSite === s.id && { backgroundColor: `${colors.yellow}20` }]}
                  onPress={() => { setFilterSite(s.id); setShowSiteDropdown(false); }}
                >
                  <Text style={[styles.dropdownItemText, { color: filterSite === s.id ? colors.yellow : theme.text }]}>{s.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Leave type picker */}
      <Modal visible={showTypeDropdown} transparent animationType="fade" onRequestClose={() => setShowTypeDropdown(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowTypeDropdown(false)}>
          <View style={[styles.pickerSheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.pickerTitle, { color: theme.text }]}>Filter by Leave Type</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <TouchableOpacity style={[styles.dropdownItem, { borderBottomColor: theme.border }]} onPress={() => { setFilterLeaveType(null); setShowTypeDropdown(false); }}>
                <Text style={[styles.dropdownItemText, { color: theme.text }]}>All Types</Text>
              </TouchableOpacity>
              {leaveTypes.map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.dropdownItem, { borderBottomColor: theme.border }, filterLeaveType === t && { backgroundColor: `${colors.yellow}20` }]}
                  onPress={() => { setFilterLeaveType(t); setShowTypeDropdown(false); }}
                >
                  <Text style={[styles.dropdownItemText, { color: filterLeaveType === t ? colors.yellow : theme.text }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
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
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
  },
  filterChipText: { fontSize: 13, fontWeight: '600' },
  clearFiltersBtn: { justifyContent: 'center', paddingHorizontal: 8 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, textTransform: 'capitalize' },
  calendarCard: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
  card: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, padding: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  emptyText: { fontSize: 13, fontStyle: 'italic' },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  entryName: { fontSize: 14, fontWeight: '600' },
  entryMeta: { fontSize: 12, marginTop: 2 },
  entryDates: { fontSize: 11, marginTop: 2 },
  entryStatus: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  pickerSheet: { width: '100%', maxWidth: 420, borderRadius: 16, borderWidth: 1, padding: 16 },
  pickerTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  dropdownItem: { padding: 14, borderBottomWidth: 1 },
  dropdownItemText: { fontSize: 15 },
});