import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator, Modal
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, X, MapPin, User } from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';
import { notify } from '../../../lib/notify';
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

type Admin = { id: string; full_name: string };
type Site = { id: string; name: string };
type Person = { id: string; full_name: string; site_id: string | null };
type PersonOverride = { employee_id: string; included: boolean };

export default function LeaveAccessManagement() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';

  const [admins, setAdmins] = useState<Admin[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedAdmin, setSelectedAdmin] = useState<Admin | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [grantedSiteIds, setGrantedSiteIds] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, boolean>>({}); // employee_id -> included
  const [saving, setSaving] = useState(false);

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
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
    const [{ data: adminData }, { data: siteData }, { data: peopleData }] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('role', 'admin').order('full_name'),
      supabase.from('sites').select('*').order('name'),
      supabase.from('profiles').select('id, full_name, site_id').neq('role', 'superuser').order('full_name'),
    ]);
    if (adminData) setAdmins(adminData);
    if (siteData) setSites(siteData);
    if (peopleData) setPeople(peopleData);
    setLoading(false);
  }

  async function openAdminConfig(admin: Admin) {
    setSelectedAdmin(admin);

    const [{ data: siteGrants }, { data: personOverrides }] = await Promise.all([
      supabase.from('leave_calendar_site_grants').select('site_id').eq('admin_id', admin.id),
      supabase.from('leave_calendar_person_overrides').select('employee_id, included').eq('admin_id', admin.id),
    ]);

    setGrantedSiteIds(new Set((siteGrants ?? []).map(s => s.site_id)));
    const overrideMap: Record<string, boolean> = {};
    (personOverrides ?? []).forEach((o: PersonOverride) => { overrideMap[o.employee_id] = o.included; });
    setOverrides(overrideMap);

    setModalVisible(true);
  }

  function toggleSite(siteId: string) {
    setGrantedSiteIds(prev => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId); else next.add(siteId);
      return next;
    });
  }

  // Cycles a person through: default (no override) -> always show ->
  // always hide -> back to default.
  function cyclePersonOverride(employeeId: string) {
    setOverrides(prev => {
      const current = prev[employeeId];
      const next = { ...prev };
      if (current === undefined) {
        next[employeeId] = true; // default -> always show
      } else if (current === true) {
        next[employeeId] = false; // always show -> always hide
      } else {
        delete next[employeeId]; // always hide -> back to default
      }
      return next;
    });
  }

  function isSiteDefaultVisible(person: Person): boolean {
    return !!person.site_id && grantedSiteIds.has(person.site_id);
  }

  function effectiveLabel(person: Person): { label: string; color: string } {
    const override = overrides[person.id];
    if (override === true) return { label: 'Always shown', color: '#10b981' };
    if (override === false) return { label: 'Always hidden', color: '#ef4444' };
    return isSiteDefaultVisible(person)
      ? { label: 'Shown (via site)', color: colors.yellow }
      : { label: 'Not visible', color: colors.gray[400] };
  }

  async function handleSave() {
    if (!selectedAdmin) return;
    setSaving(true);

    await supabase.from('leave_calendar_site_grants').delete().eq('admin_id', selectedAdmin.id);
    await supabase.from('leave_calendar_person_overrides').delete().eq('admin_id', selectedAdmin.id);

    const { data: userData } = await supabase.auth.getUser();

    if (grantedSiteIds.size > 0) {
      const siteRows = Array.from(grantedSiteIds).map(siteId => ({
        admin_id: selectedAdmin.id,
        site_id: siteId,
        granted_by: userData.user?.id,
      }));
      await supabase.from('leave_calendar_site_grants').insert(siteRows);
    }

    const overrideEntries = Object.entries(overrides);
    if (overrideEntries.length > 0) {
      const overrideRows = overrideEntries.map(([employeeId, included]) => ({
        admin_id: selectedAdmin.id,
        employee_id: employeeId,
        included,
        granted_by: userData.user?.id,
      }));
      await supabase.from('leave_calendar_person_overrides').insert(overrideRows);
    }

    setSaving(false);
    setModalVisible(false);
    notify('Saved', `Leave calendar access updated for ${selectedAdmin.full_name}.`);
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
          <Text style={[styles.headerTitle, { color: theme.text }]}>Leave Calendar Access</Text>
          <View style={{ width: 24 }} />
        </View>

        <Text style={[styles.hint, { color: theme.subtext }]}>
          Choose which sites and/or specific people each admin can see on the leave calendar.
          Admins always see their own leave regardless of these settings.
        </Text>

        {admins.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={{ color: theme.subtext }}>No admin users exist yet.</Text>
          </View>
        ) : (
          admins.map(admin => (
            <TouchableOpacity
              key={admin.id}
              style={[styles.adminRow, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => openAdminConfig(admin)}
            >
              <Text style={[styles.adminName, { color: theme.text }]}>{admin.full_name}</Text>
              <ChevronRight color={theme.muted} size={18} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent={false} onRequestClose={() => setModalVisible(false)}>
        <ScrollView style={[styles.modalContainer, { backgroundColor: theme.background }]} contentContainerStyle={styles.modalContent}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <X color={theme.muted} size={24} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{selectedAdmin?.full_name}</Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Sites */}
          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.cardHeaderLeft}>
              <MapPin color={colors.yellow} size={18} />
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Sites</Text>
            </View>
            <Text style={[styles.hint, { color: theme.subtext, marginBottom: 12 }]}>
              Everyone at a checked site is visible by default — override specific people below.
            </Text>
            {sites.map(site => {
              const checked = grantedSiteIds.has(site.id);
              return (
                <TouchableOpacity
                  key={site.id}
                  style={[styles.switchRow, { borderBottomColor: theme.border }]}
                  onPress={() => toggleSite(site.id)}
                >
                  <Text style={[styles.switchLabel, { color: theme.text }]}>{site.name}</Text>
                  <View style={[styles.toggle, { backgroundColor: checked ? colors.yellow : theme.border }]}>
                    <View style={[styles.toggleThumb, { transform: [{ translateX: checked ? 20 : 2 }] }]} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Individual overrides */}
          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.cardHeaderLeft}>
              <User color={colors.yellow} size={18} />
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Individual Overrides</Text>
            </View>
            <Text style={[styles.hint, { color: theme.subtext, marginBottom: 12 }]}>
              Tap a person to cycle: Default → Always shown → Always hidden → Default.
            </Text>
            {people.map(person => {
              const effective = effectiveLabel(person);
              return (
                <TouchableOpacity
                  key={person.id}
                  style={[styles.personRow, { borderBottomColor: theme.border }]}
                  onPress={() => cyclePersonOverride(person.id)}
                >
                  <Text style={[styles.personName, { color: theme.text }]}>{person.full_name}</Text>
                  <Text style={[styles.personStatus, { color: effective.color }]}>{effective.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.black} /> : <Text style={styles.saveBtnText}>Save Access</Text>}
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, paddingTop: 60, paddingBottom: 48 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  hint: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  emptyCard: { padding: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center' },
  adminRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 10,
  },
  adminName: { fontSize: 15, fontWeight: '600' },
  modalContainer: { flex: 1 },
  modalContent: { paddingBottom: 48 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  formCard: { margin: 16, borderRadius: 20, padding: 20, borderWidth: 1 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1,
  },
  switchLabel: { fontSize: 15, fontWeight: '600' },
  toggle: { width: 46, height: 26, borderRadius: 13, justifyContent: 'center' },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white },
  personRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1,
  },
  personName: { fontSize: 14, fontWeight: '600' },
  personStatus: { fontSize: 12, fontWeight: '700' },
  saveBtn: {
    backgroundColor: colors.yellow, borderRadius: 14, height: 56,
    alignItems: 'center', justifyContent: 'center', margin: 16,
  },
  saveBtnText: { color: colors.black, fontSize: 16, fontWeight: '700' },
});