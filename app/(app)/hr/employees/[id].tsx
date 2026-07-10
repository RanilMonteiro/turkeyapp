import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator,
  Alert, TextInput, Modal
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, User, MapPin, Phone, Briefcase, Hash, ChevronDown, X } from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';

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
  id_number: string | null;
  date_joined: string | null;
  site_id: string | null;
  sites: { name: string } | null;
};

type Site = {
  id: string;
  name: string;
};

export default function EmployeeProfile() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const isDark = useColorScheme() === 'dark';

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSiteDropdown, setShowSiteDropdown] = useState(false);

  // Edit fields
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [dateJoined, setDateJoined] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

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

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    const [{ data: emp }, { data: siteData }] = await Promise.all([
      supabase
        .from('profiles')
        .select('*, sites(name)')
        .eq('id', id)
        .single(),
      supabase
        .from('sites')
        .select('*')
        .order('name', { ascending: true }),
    ]);

    if (emp) {
      setEmployee(emp);
      setEmployeeNumber(emp.employee_number ?? '');
      setJobTitle(emp.job_title ?? '');
      setDepartment(emp.department ?? '');
      setPhone(emp.phone ?? '');
      setIdNumber(emp.id_number ?? '');
      setDateJoined(emp.date_joined ?? '');
      setSelectedSiteId(emp.site_id ?? null);
    }
    if (siteData) setSites(siteData);
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        employee_number: employeeNumber || null,
        job_title: jobTitle || null,
        department: department || null,
        phone: phone || null,
        id_number: idNumber || null,
        date_joined: dateJoined || null,
        site_id: selectedSiteId,
      })
      .eq('id', id);

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setEditModal(false);
      fetchData();
    }
  }

  function getRoleBadgeColor(role: string) {
    switch (role) {
      case 'admin': return { bg: isDark ? '#1e3a5f' : '#dbeafe', text: '#3b82f6' };
      case 'hr': return { bg: isDark ? '#3b1f5f' : '#ede9fe', text: '#8b5cf6' };
      default: return { bg: isDark ? '#1a2e1a' : '#d1fae5', text: '#10b981' };
    }
  }

  const selectedSite = sites.find(s => s.id === selectedSiteId);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }

  if (!employee) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.subtext }}>Employee not found</Text>
      </View>
    );
  }

  const badge = getRoleBadgeColor(employee.role);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft color={colors.yellow} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Employee Profile</Text>
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => setEditModal(true)}
        >
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Avatar + Name */}
        <View style={[styles.profileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.avatar, { backgroundColor: theme.avatarBg }]}>
            <User color={colors.yellow} size={36} />
          </View>
          <Text style={[styles.name, { color: theme.text }]}>{employee.full_name}</Text>
          <View style={[styles.roleBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.roleText, { color: badge.text }]}>
              {employee.role.charAt(0).toUpperCase() + employee.role.slice(1)}
            </Text>
          </View>
          {employee.sites && (
            <View style={styles.siteRow}>
              <MapPin color={colors.yellow} size={14} />
              <Text style={[styles.siteName, { color: theme.subtext }]}>
                {employee.sites.name}
              </Text>
            </View>
          )}
        </View>

        {/* Details */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Work Details</Text>

          <DetailRow
            icon={<Hash color={colors.yellow} size={16} />}
            label="Employee Number"
            value={employee.employee_number}
            theme={theme}
          />
          <DetailRow
            icon={<Briefcase color={colors.yellow} size={16} />}
            label="Job Title"
            value={employee.job_title}
            theme={theme}
          />
          <DetailRow
            icon={<Briefcase color={colors.yellow} size={16} />}
            label="Department"
            value={employee.department}
            theme={theme}
          />
          <DetailRow
            icon={<Phone color={colors.yellow} size={16} />}
            label="Phone"
            value={employee.phone}
            theme={theme}
          />
          <DetailRow
            icon={<Hash color={colors.yellow} size={16} />}
            label="ID Number"
            value={employee.id_number}
            theme={theme}
          />
          <DetailRow
            icon={<Briefcase color={colors.yellow} size={16} />}
            label="Date Joined"
            value={employee.date_joined}
            theme={theme}
            isLast
          />
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <Modal
        visible={editModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setEditModal(false)}
      >
        <ScrollView
          style={[styles.modalContainer, { backgroundColor: theme.background }]}
          contentContainerStyle={styles.modalContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setEditModal(false)}>
              <X color={theme.muted} size={24} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Profile</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>

            <Field label="Employee Number" value={employeeNumber} onChange={setEmployeeNumber} theme={theme} placeholder="e.g. TKI001" />
            <Field label="Job Title" value={jobTitle} onChange={setJobTitle} theme={theme} placeholder="e.g. Field Technician" />
            <Field label="Department" value={department} onChange={setDepartment} theme={theme} placeholder="e.g. Operations" />
            <Field label="Phone" value={phone} onChange={setPhone} theme={theme} placeholder="e.g. 071 234 5678" keyboardType="phone-pad" />
            <Field label="ID Number" value={idNumber} onChange={setIdNumber} theme={theme} placeholder="e.g. 9001015009087" keyboardType="numeric" />
            <Field label="Date Joined" value={dateJoined} onChange={setDateJoined} theme={theme} placeholder="YYYY-MM-DD" />

            {/* Site Dropdown */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>SITE</Text>
              <TouchableOpacity
                style={[styles.dropdownBtn, { backgroundColor: theme.input, borderColor: theme.border }]}
                onPress={() => setShowSiteDropdown(!showSiteDropdown)}
              >
                <MapPin color={colors.yellow} size={16} />
                <Text style={[styles.dropdownBtnText, { color: selectedSiteId ? theme.text : theme.subtext }]}>
                  {selectedSite?.name ?? 'Select a site'}
                </Text>
                <ChevronDown color={theme.muted} size={16} />
              </TouchableOpacity>

              {showSiteDropdown && (
                <View style={[styles.dropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <TouchableOpacity
                    style={[styles.dropdownItem, { borderBottomColor: theme.border }]}
                    onPress={() => {
                      setSelectedSiteId(null);
                      setShowSiteDropdown(false);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, { color: theme.subtext }]}>No site</Text>
                  </TouchableOpacity>
                  {sites.map(site => (
                    <TouchableOpacity
                      key={site.id}
                      style={[
                        styles.dropdownItem,
                        { borderBottomColor: theme.border },
                        selectedSiteId === site.id && { backgroundColor: `${colors.yellow}20` },
                      ]}
                      onPress={() => {
                        setSelectedSiteId(site.id);
                        setShowSiteDropdown(false);
                      }}
                    >
                      <Text style={[
                        styles.dropdownItemText,
                        { color: selectedSiteId === site.id ? colors.yellow : theme.text }
                      ]}>
                        {site.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color={colors.black} />
              : <Text style={styles.saveBtnText}>Save Changes</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </View>
  );
}

function DetailRow({ icon, label, value, theme, isLast }: any) {
  return (
    <View style={[styles.detailRow, !isLast && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
      <View style={styles.detailIcon}>{icon}</View>
      <View style={styles.detailInfo}>
        <Text style={[styles.detailLabel, { color: theme.subtext }]}>{label}</Text>
        <Text style={[styles.detailValue, { color: value ? theme.text : theme.muted }]}>
          {value ?? 'Not set'}
        </Text>
      </View>
    </View>
  );
}

function Field({ label, value, onChange, theme, placeholder, keyboardType }: any) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: theme.subtext }]}>{label.toUpperCase()}</Text>
      <TextInput
        style={[styles.fieldInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
        placeholder={placeholder}
        placeholderTextColor={theme.subtext}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType ?? 'default'}
      />
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
  editBtn: {
    backgroundColor: colors.yellow,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  editBtnText: { color: colors.black, fontWeight: '700', fontSize: 14 },
  content: { padding: 16, gap: 16 },
  profileCard: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  name: { fontSize: 22, fontWeight: '700' },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  roleText: { fontSize: 13, fontWeight: '600' },
  siteRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  siteName: { fontSize: 13 },
  card: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  detailIcon: { width: 24, alignItems: 'center' },
  detailInfo: { flex: 1 },
  detailLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 },
  detailValue: { fontSize: 15 },
  // Modal
  modalContainer: { flex: 1 },
  modalContent: { paddingBottom: 48 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  formCard: {
    margin: 16,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
  },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, marginBottom: 8 },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
  },
  dropdownBtnText: { flex: 1, fontSize: 15 },
  dropdown: {
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 4,
    overflow: 'hidden',
  },
  dropdownItem: {
    padding: 14,
    borderBottomWidth: 1,
  },
  dropdownItemText: { fontSize: 15 },
  saveBtn: {
    backgroundColor: colors.yellow,
    borderRadius: 14,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
  },
  saveBtnText: { color: colors.black, fontSize: 16, fontWeight: '700' },
});