import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator,
  Alert, Modal
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, GitBranch, Plus, Trash2, ChevronDown, X, User } from 'lucide-react-native';
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

type Profile = {
  id: string;
  full_name: string;
  role: string;
  sites: { name: string } | null;
};

type Site = {
  id: string;
  name: string;
};

type ApprovalChain = {
  id: string;
  employee_id: string;
  approver_id: string;
  site_id: string | null;
  approval_order: number;
  employee: { full_name: string; role: string } | null;
  approver: { full_name: string; role: string } | null;
  site: { name: string } | null;
};

type GroupedChain = {
  employee: Profile;
  site: Site | null;
  approvers: { id: string; approver: Profile; order: number; chainId: string }[];
};

export default function ApprovalChains() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';

  const [chains, setChains] = useState<GroupedChain[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [admins, setAdmins] = useState<Profile[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);

  // Modal state
  const [selectedEmployee, setSelectedEmployee] = useState<Profile | null>(null);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [selectedApprovers, setSelectedApprovers] = useState<(Profile | null)[]>([null]);
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [showSiteDropdown, setShowSiteDropdown] = useState(false);
  const [showApproverDropdown, setShowApproverDropdown] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

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
    const [
      { data: chainData },
      { data: employeeData },
      { data: adminData },
      { data: siteData },
    ] = await Promise.all([
      supabase
        .from('approval_chains')
        .select(`
          *,
          employee:employee_id(full_name, role),
          approver:approver_id(full_name, role),
          site:site_id(name)
        `)
        .order('approval_order'),
      supabase
        .from('profiles')
        .select('*, sites(name)')
        .in('role', ['technician', 'admin'])
        .order('full_name'),
      supabase
        .from('profiles')
        .select('*, sites(name)')
        .in('role', ['admin', 'hr', 'superuser'])
        .order('full_name'),
      supabase
        .from('sites')
        .select('*')
        .order('name'),
    ]);

    if (employeeData) setEmployees(employeeData);
    if (adminData) setAdmins(adminData);
    if (siteData) setSites(siteData);

    // Group chains by employee
    if (chainData) {
      const grouped: { [key: string]: GroupedChain } = {};
      chainData.forEach((chain: any) => {
        const key = chain.employee_id;
        if (!grouped[key]) {
          grouped[key] = {
            employee: { id: chain.employee_id, ...chain.employee, sites: chain.site },
            site: chain.site,
            approvers: [],
          };
        }
        grouped[key].approvers.push({
          id: chain.approver_id,
          approver: { id: chain.approver_id, ...chain.approver, sites: null },
          order: chain.approval_order,
          chainId: chain.id,
        });
      });
      setChains(Object.values(grouped));
    }

    setLoading(false);
  }

  function openModal() {
    setSelectedEmployee(null);
    setSelectedSite(null);
    setSelectedApprovers([null]);
    setModalVisible(true);
  }

  function addApprover() {
    if (selectedApprovers.length >= 4) {
      Alert.alert('Maximum reached', 'You can add a maximum of 4 approvers.');
      return;
    }
    setSelectedApprovers(prev => [...prev, null]);
  }

  function removeApprover(index: number) {
    if (selectedApprovers.length === 1) {
      Alert.alert('Minimum required', 'At least 1 approver is required.');
      return;
    }
    setSelectedApprovers(prev => prev.filter((_, i) => i !== index));
  }

  function setApprover(index: number, approver: Profile) {
    setSelectedApprovers(prev => prev.map((a, i) => i === index ? approver : a));
    setShowApproverDropdown(null);
  }

  async function handleSave() {
    if (!selectedEmployee) {
      Alert.alert('Missing employee', 'Please select an employee.');
      return;
    }
    if (selectedApprovers.some(a => a === null)) {
      Alert.alert('Missing approvers', 'Please select all approvers.');
      return;
    }

    setSaving(true);

    // Delete existing chains for this employee
    await supabase
      .from('approval_chains')
      .delete()
      .eq('employee_id', selectedEmployee.id);

    const { data: userData } = await supabase.auth.getUser();

    // Insert new chains
    const rows = selectedApprovers.map((approver, index) => ({
      employee_id: selectedEmployee.id,
      approver_id: approver!.id,
      site_id: selectedSite?.id ?? null,
      approval_order: index + 1,
      created_by: userData.user?.id,
    }));

    const { error } = await supabase
      .from('approval_chains')
      .insert(rows);

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setModalVisible(false);
      fetchData();
    }
  }

  async function deleteChain(employeeId: string, employeeName: string) {
    Alert.alert(
      'Delete Approval Chain',
      `Remove approval chain for ${employeeName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await supabase
              .from('approval_chains')
              .delete()
              .eq('employee_id', employeeId);
            fetchData();
          }
        }
      ]
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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft color={colors.yellow} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Approval Chains</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openModal}>
          <Plus color={colors.black} size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {chains.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <GitBranch color={theme.muted} size={40} />
            <Text style={[styles.emptyText, { color: theme.subtext }]}>No approval chains yet</Text>
            <Text style={[styles.emptyHint, { color: theme.muted }]}>
              Tap + to set up who approves for each employee
            </Text>
          </View>
        ) : (
          chains.map((chain) => (
            <View
              key={chain.employee.id}
              style={[styles.chainCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              {/* Employee */}
              <View style={styles.chainHeader}>
                <View style={[styles.avatar, { backgroundColor: theme.avatarBg }]}>
                  <User color={colors.yellow} size={18} />
                </View>
                <View style={styles.chainHeaderInfo}>
                  <Text style={[styles.employeeName, { color: theme.text }]}>
                    {chain.employee.full_name}
                  </Text>
                  {chain.site && (
                    <Text style={[styles.siteName, { color: theme.subtext }]}>
                      📍 {chain.site.name}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => deleteChain(chain.employee.id, chain.employee.full_name)}
                >
                  <Trash2 color="#ef4444" size={18} />
                </TouchableOpacity>
              </View>

              {/* Approvers */}
              <View style={[styles.approversSection, { borderTopColor: theme.border }]}>
                {chain.approvers
                  .sort((a, b) => a.order - b.order)
                  .map((approver, index) => (
                    <View key={approver.chainId} style={styles.approverRow}>
                      <View style={[styles.orderBadge, { backgroundColor: `${colors.yellow}20` }]}>
                        <Text style={[styles.orderText, { color: colors.yellow }]}>
                          {approver.order}
                        </Text>
                      </View>
                      <Text style={[styles.approverName, { color: theme.text }]}>
                        {approver.approver.full_name}
                      </Text>
                      <Text style={[styles.approverRole, { color: theme.subtext }]}>
                        {approver.approver.role}
                      </Text>
                      {index < chain.approvers.length - 1 && (
                        <View style={[styles.arrow, { borderColor: theme.border }]} />
                      )}
                    </View>
                  ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Create Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setModalVisible(false)}
      >
        <ScrollView
          style={[styles.container, { backgroundColor: theme.background }]}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <X color={colors.yellow} size={24} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.text }]}>New Approval Chain</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>

            {/* Employee */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.subtext }]}>EMPLOYEE *</Text>
              <TouchableOpacity
                style={[styles.dropdownBtn, { backgroundColor: theme.input, borderColor: theme.border }]}
                onPress={() => setShowEmployeeDropdown(!showEmployeeDropdown)}
              >
                <User color={colors.yellow} size={16} />
                <Text style={[styles.dropdownBtnText, { color: selectedEmployee ? theme.text : theme.subtext }]}>
                  {selectedEmployee?.full_name ?? 'Select employee'}
                </Text>
                <ChevronDown color={theme.muted} size={16} />
              </TouchableOpacity>
              {showEmployeeDropdown && (
                <View style={[styles.dropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                    {employees.map(emp => (
                      <TouchableOpacity
                        key={emp.id}
                        style={[
                          styles.dropdownItem,
                          { borderBottomColor: theme.border },
                          selectedEmployee?.id === emp.id && { backgroundColor: `${colors.yellow}20` }
                        ]}
                        onPress={() => {
                          setSelectedEmployee(emp);
                          setShowEmployeeDropdown(false);
                        }}
                      >
                        <Text style={[styles.dropdownItemText, { color: selectedEmployee?.id === emp.id ? colors.yellow : theme.text }]}>
                          {emp.full_name}
                        </Text>
                        <Text style={[styles.dropdownItemSub, { color: theme.subtext }]}>
                          {emp.role}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Site */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.subtext }]}>SITE</Text>
              <TouchableOpacity
                style={[styles.dropdownBtn, { backgroundColor: theme.input, borderColor: theme.border }]}
                onPress={() => setShowSiteDropdown(!showSiteDropdown)}
              >
                <Text style={[styles.dropdownBtnText, { color: selectedSite ? theme.text : theme.subtext }]}>
                  {selectedSite?.name ?? 'Select site (optional)'}
                </Text>
                <ChevronDown color={theme.muted} size={16} />
              </TouchableOpacity>
              {showSiteDropdown && (
                <View style={[styles.dropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <TouchableOpacity
                    style={[styles.dropdownItem, { borderBottomColor: theme.border }]}
                    onPress={() => { setSelectedSite(null); setShowSiteDropdown(false); }}
                  >
                    <Text style={[styles.dropdownItemText, { color: theme.subtext }]}>No specific site</Text>
                  </TouchableOpacity>
                  {sites.map(site => (
                    <TouchableOpacity
                      key={site.id}
                      style={[
                        styles.dropdownItem,
                        { borderBottomColor: theme.border },
                        selectedSite?.id === site.id && { backgroundColor: `${colors.yellow}20` }
                      ]}
                      onPress={() => { setSelectedSite(site); setShowSiteDropdown(false); }}
                    >
                      <Text style={[styles.dropdownItemText, { color: selectedSite?.id === site.id ? colors.yellow : theme.text }]}>
                        {site.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Approvers */}
            <View style={styles.fieldGroup}>
              <View style={styles.approversHeader}>
                <Text style={[styles.label, { color: theme.subtext }]}>
                  APPROVERS * (MAX 4, MIN 1)
                </Text>
                {selectedApprovers.length < 4 && (
                  <TouchableOpacity onPress={addApprover}>
                    <Text style={[styles.addApproverText, { color: colors.yellow }]}>+ Add</Text>
                  </TouchableOpacity>
                )}
              </View>

              {selectedApprovers.map((approver, index) => (
                <View key={index} style={styles.approverInputRow}>
                  <View style={[styles.orderBadge, { backgroundColor: `${colors.yellow}20` }]}>
                    <Text style={[styles.orderText, { color: colors.yellow }]}>{index + 1}</Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.approverDropdownBtn, { backgroundColor: theme.input, borderColor: theme.border, flex: 1 }]}
                    onPress={() => setShowApproverDropdown(showApproverDropdown === index ? null : index)}
                  >
                    <Text style={[styles.dropdownBtnText, { color: approver ? theme.text : theme.subtext }]}>
                      {approver?.full_name ?? 'Select approver'}
                    </Text>
                    <ChevronDown color={theme.muted} size={14} />
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => removeApprover(index)}>
                    <Trash2 color="#ef4444" size={18} />
                  </TouchableOpacity>

                  {showApproverDropdown === index && (
                    <View style={[styles.approverDropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
                      <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                        {admins.map(admin => (
                          <TouchableOpacity
                            key={admin.id}
                            style={[
                              styles.dropdownItem,
                              { borderBottomColor: theme.border },
                              approver?.id === admin.id && { backgroundColor: `${colors.yellow}20` }
                            ]}
                            onPress={() => setApprover(index, admin)}
                          >
                            <Text style={[styles.dropdownItemText, { color: approver?.id === admin.id ? colors.yellow : theme.text }]}>
                              {admin.full_name}
                            </Text>
                            <Text style={[styles.dropdownItemSub, { color: theme.subtext }]}>
                              {admin.role}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color={colors.black} />
              : <Text style={styles.saveBtnText}>Save Approval Chain</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </Modal>
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
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  addBtn: {
    backgroundColor: colors.yellow,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  emptyCard: {
    padding: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
  },
  emptyText: { fontSize: 16, fontWeight: '600' },
  emptyHint: { fontSize: 13, textAlign: 'center' },
  chainCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  chainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chainHeaderInfo: { flex: 1 },
  employeeName: { fontSize: 15, fontWeight: '700' },
  siteName: { fontSize: 12, marginTop: 2 },
  approversSection: {
    borderTopWidth: 1,
    padding: 14,
    gap: 10,
  },
  approverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orderBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderText: { fontSize: 13, fontWeight: '700' },
  approverName: { flex: 1, fontSize: 14, fontWeight: '600' },
  approverRole: { fontSize: 12 },
  arrow: {
    position: 'absolute',
    left: 14,
    bottom: -10,
    height: 10,
    borderLeftWidth: 1,
    borderStyle: 'dashed',
  },
  // Modal form
  formCard: {
    margin: 16,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
  },
  fieldGroup: { marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, marginBottom: 8 },
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
  dropdownItemText: { fontSize: 15, fontWeight: '500' },
  dropdownItemSub: { fontSize: 12, marginTop: 2 },
  approversHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addApproverText: { fontSize: 14, fontWeight: '700' },
  approverInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    position: 'relative',
  },
  approverDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    gap: 8,
  },
  approverDropdown: {
    position: 'absolute',
    top: 52,
    left: 38,
    right: 30,
    borderWidth: 1,
    borderRadius: 12,
    zIndex: 999,
    overflow: 'hidden',
  },
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