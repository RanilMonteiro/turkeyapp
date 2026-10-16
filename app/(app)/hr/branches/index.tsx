import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  useColorScheme, ActivityIndicator, TextInput, Modal,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Building2, Plus, Pencil, Trash2, X, ChevronRight, Users } from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';
import { notify, confirm } from '../../../../lib/notify';

const colors = {
  yellow: '#fbbf24',
  white: '#ffffff',
  black: '#000000',
  gray: { 50: '#f8fafc', 200: '#e2e8f0', 400: '#94a3b8', 500: '#64748b', 700: '#334155', 800: '#1e293b', 900: '#0f172a' },
};

type Branch = { id: string; name: string; memberCount: number };

export default function BranchesScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  // Create / rename modal. editingId === null means "create".
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
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
      fetchBranches();
    }, [])
  );

  async function fetchBranches() {
   const { data, error } = await supabase
  .from('branches')
  .select('id, name, profiles!branch_id(count)')
  .order('name', { ascending: true });

    if (error) {
      notify('Error', error.message);
    } else if (data) {
      setBranches(
        (data as any[]).map(b => ({
          id: b.id,
          name: b.name,
          memberCount: b.profiles?.[0]?.count ?? 0,
        }))
      );
    }
    setLoading(false);
  }

  function openCreate() {
    setEditingId(null);
    setNameInput('');
    setModalVisible(true);
  }

  function openRename(branch: Branch) {
    setEditingId(branch.id);
    setNameInput(branch.name);
    setModalVisible(true);
  }

  async function handleSave() {
    const name = nameInput.trim();
    if (!name) {
      notify('Missing name', 'Please enter a branch name.');
      return;
    }

    setSaving(true);

    let errorMessage: string | null = null;
    if (editingId) {
      const { error } = await supabase.from('branches').update({ name }).eq('id', editingId);
      errorMessage = error?.message ?? null;
    } else {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('branches')
        .insert({ name, created_by: userData.user?.id });
      errorMessage = error?.message ?? null;
    }

    setSaving(false);

    if (errorMessage) {
      // 23505 = unique violation (branches_name_unique index)
      notify(
        'Could not save',
        errorMessage.includes('duplicate') ? 'A branch with that name already exists.' : errorMessage
      );
      return;
    }

    setModalVisible(false);
    fetchBranches();
  }

  function handleDelete(branch: Branch) {
    const peopleNote =
      branch.memberCount > 0
        ? ` ${branch.memberCount} ${branch.memberCount === 1 ? 'person' : 'people'} will be left without a branch.`
        : '';
    confirm(
      'Delete Branch',
      `Delete "${branch.name}"?${peopleNote} Leave calendar access linked to this branch will also be removed.`,
      async () => {
        const { error } = await supabase.from('branches').delete().eq('id', branch.id);
        if (error) {
          notify('Error', error.message);
        } else {
          fetchBranches();
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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft color={colors.yellow} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Branches</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
          <Plus color={colors.black} size={18} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {branches.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Building2 color={theme.muted} size={32} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No branches yet</Text>
            <Text style={[styles.emptyText, { color: theme.subtext }]}>
              Create a branch such as Head Office, then assign employees to it from their profile.
            </Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={openCreate}>
              <Text style={styles.emptyBtnText}>Create branch</Text>
            </TouchableOpacity>
          </View>
        ) : (
          branches.map(branch => (
            <View
              key={branch.id}
              style={[styles.branchCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <TouchableOpacity
                style={styles.branchMain}
                onPress={() => router.push(`/(app)/hr/branches/${branch.id}` as any)}
              >
                <View style={[styles.branchIcon, { backgroundColor: `${colors.yellow}20` }]}>
                  <Building2 color={colors.yellow} size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.branchName, { color: theme.text }]} numberOfLines={1}>
                    {branch.name}
                  </Text>
                  <View style={styles.countRow}>
                    <Users color={theme.muted} size={13} />
                    <Text style={[styles.countText, { color: theme.subtext }]}>
                      {branch.memberCount} {branch.memberCount === 1 ? 'person' : 'people'}
                    </Text>
                  </View>
                </View>
                <ChevronRight color={theme.muted} size={18} />
              </TouchableOpacity>

              <View style={[styles.actionsRow, { borderTopColor: theme.border }]}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openRename(branch)}>
                  <Pencil color={colors.yellow} size={15} />
                  <Text style={{ color: colors.yellow, fontSize: 13, fontWeight: '600' }}>Rename</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(branch)}>
                  <Trash2 color="#ef4444" size={15} />
                  <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '600' }}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Create / rename modal */}
      <Modal visible={modalVisible} animationType="fade" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.text }]}>
                {editingId ? 'Rename branch' : 'New branch'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X color={theme.muted} size={22} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.fieldLabel, { color: theme.subtext }]}>BRANCH NAME</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
              placeholder="e.g. Head Office"
              placeholderTextColor={theme.muted}
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={colors.black} />
              ) : (
                <Text style={styles.saveBtnText}>{editingId ? 'Save name' : 'Create branch'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  addBtn: {
    backgroundColor: colors.yellow, width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  content: { padding: 16, gap: 12 },
  branchCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  branchMain: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  branchIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  branchName: { fontSize: 16, fontWeight: '700' },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  countText: { fontSize: 12 },
  actionsRow: { flexDirection: 'row', borderTopWidth: 1 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
  },
  emptyCard: { borderRadius: 16, borderWidth: 1, padding: 32, alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  emptyBtn: { backgroundColor: colors.yellow, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10, marginTop: 6 },
  emptyBtnText: { color: colors.black, fontWeight: '700', fontSize: 14 },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  sheet: { width: '100%', maxWidth: 420, borderRadius: 16, borderWidth: 1, padding: 20 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '700' },
  fieldLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  saveBtn: {
    backgroundColor: colors.yellow, borderRadius: 14, height: 52,
    alignItems: 'center', justifyContent: 'center', marginTop: 18,
  },
  saveBtnText: { color: colors.black, fontSize: 16, fontWeight: '700' },
});