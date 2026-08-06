import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator,
  TextInput, Modal, Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, User, Search, MapPin, ChevronRight } from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';

const colors = {
  yellow: '#fbbf24',
  white: '#ffffff',
  black: '#000000',
  gray: {
    50: '#f8fafc',
    200: '#e2e8f0',
    400: '#94a3b8',
    500: '#64748b',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  }
};

type Employee = {
  id: string;
  full_name: string;
  role: string;
  employee_number: string | null;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  site_id: string | null;
  sites: { name: string } | null;
};

type Site = {
  id: string;
  name: string;
};

export default function Employees() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    input: isDark ? colors.gray[800] : colors.gray[50],
    text: isDark ? colors.white : '#1e293b',
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    muted: isDark ? colors.gray[500] : colors.gray[400],
    avatarBg: isDark ? colors.gray[800] : colors.gray[200],
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

async function fetchData() {
  const [{ data: emps }, { data: siteData }] = await Promise.all([
    supabase
      .from('profiles')
      .select('*, sites(name)')
      .order('full_name', { ascending: true }),
    supabase
      .from('sites')
      .select('*')
      .order('name', { ascending: true }),
  ]);

  if (emps) setEmployees(emps);
  if (siteData) setSites(siteData);
  setLoading(false);
}

function getRoleBadgeColor(role: string) {
  switch (role) {
    case 'superuser': return { bg: isDark ? '#78350f' : '#fef3c7', text: '#f59e0b' };
    case 'admin': return { bg: isDark ? '#1e3a5f' : '#dbeafe', text: '#3b82f6' };
    case 'hr': return { bg: isDark ? '#3b1f5f' : '#ede9fe', text: '#8b5cf6' };
    default: return { bg: isDark ? '#1a2e1a' : '#d1fae5', text: '#10b981' };
  }
}
  const filtered = employees.filter(e =>
    e.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    e.job_title?.toLowerCase().includes(search.toLowerCase()) ||
    e.department?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft color={colors.yellow} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Employees</Text>
        <Text style={[styles.headerCount, { color: theme.subtext }]}>{employees.length}</Text>
      </View>

      {/* Search */}
      <View style={[styles.searchRow, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <View style={[styles.searchBox, { backgroundColor: theme.input, borderColor: theme.border }]}>
          <Search color={theme.muted} size={16} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search by name, title, department..."
            placeholderTextColor={theme.muted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {filtered.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.emptyText, { color: theme.subtext }]}>No employees found</Text>
          </View>
        ) : (
          filtered.map((employee) => {
            const badge = getRoleBadgeColor(employee.role);
            return (
              <TouchableOpacity
                key={employee.id}
                style={[styles.employeeCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => router.push(`/(app)/hr/employees/${employee.id}` as any)}
                activeOpacity={0.8}
              >
                <View style={styles.cardLeft}>
                  <View style={[styles.avatar, { backgroundColor: theme.avatarBg }]}>
                    <User color={colors.yellow} size={22} />
                  </View>
                  <View style={styles.info}>
                    <Text style={[styles.name, { color: theme.text }]}>{employee.full_name}</Text>
                    {employee.job_title && (
                      <Text style={[styles.jobTitle, { color: theme.subtext }]}>{employee.job_title}</Text>
                    )}
                    <View style={styles.metaRow}>
                      <View style={[styles.roleBadge, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.roleText, { color: badge.text }]}>
                          {employee.role.charAt(0).toUpperCase() + employee.role.slice(1)}
                        </Text>
                      </View>
                      {employee.sites && (
                        <View style={styles.siteRow}>
                          <MapPin color={colors.yellow} size={11} />
                          <Text style={[styles.siteName, { color: theme.subtext }]}>
                            {employee.sites.name}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
                <ChevronRight color={theme.muted} size={18} />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  headerCount: { fontSize: 15, fontWeight: '600' },
  searchRow: {
    padding: 12,
    borderBottomWidth: 1,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },
  content: { padding: 16, gap: 10 },
  emptyCard: {
    padding: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyText: { fontSize: 15 },
  employeeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  jobTitle: { fontSize: 13, marginBottom: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  roleText: { fontSize: 11, fontWeight: '600' },
  siteRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  siteName: { fontSize: 11 },
});