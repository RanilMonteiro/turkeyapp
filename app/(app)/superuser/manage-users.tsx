import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator,
  Modal, TextInput
} from 'react-native';
import { useRouter } from 'expo-router';
import { User, Plus, Edit, Archive, Shield, Wrench } from 'lucide-react-native';
import Avatar from '../../../components/Avatar';
import { supabase } from '../../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { notify } from '../../../lib/notify';

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
  avatar_url?: string | null;
  role: 'superuser' | 'admin' | 'technician' | 'hr';
  site_id: string | null;
};
export default function ManageUsers() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    text: isDark ? colors.white : colors.gray[800],
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    muted: isDark ? colors.gray[500] : colors.gray[400],
    avatarBg: isDark ? colors.gray[800] : colors.gray[200],
  };

  useFocusEffect(
    useCallback(() => {
      fetchUsers();
    }, [])
  );

  async function fetchUsers() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('role', 'superuser')
      .eq('is_archived', false)
      .order('full_name', { ascending: true });

    if (!error && data) setUsers(data);
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_archived', true);
    setArchivedCount(count ?? 0);
    setLoading(false);
  }

function askArchive(userId: string, name: string) {
  setArchiveReason('');
  setArchiveTarget({ id: userId, name });
}

async function confirmArchive() {
  if (!archiveTarget) return;
  setArchiving(true);
  const { error } = await supabase.rpc('archive_user', {
    p_user_id: archiveTarget.id,
    p_reason: archiveReason.trim() || null,
  });
  setArchiving(false);
  if (error) {
    notify('Could not archive', error.message);
    return;
  }
  const name = archiveTarget.name;
  setArchiveTarget(null);
  notify('Archived', `${name} has been deactivated and moved to the Archive. All their information is kept.`);
  fetchUsers();
}

function getRoleIcon(role: string) {
  if (role === 'admin') return <Shield color={colors.yellow} size={18} />;
  if (role === 'hr') return <User color={colors.yellow} size={18} />;
  return <Wrench color={colors.yellow} size={18} />;
}

function getRoleBadgeColor(role: string) {
  if (role === 'admin') return isDark ? '#1e3a5f' : '#dbeafe';
  if (role === 'hr') return isDark ? '#4a1d5f' : '#f3e8ff';
  return isDark ? '#1a2e1a' : '#d1fae5';
}

function getRoleTextColor(role: string) {
  if (role === 'admin') return '#3b82f6';
  if (role === 'hr') return '#a855f7';
  return '#10b981';
}
const admins = users.filter(u => u.role === 'admin');
const technicians = users.filter(u => u.role === 'technician');
const hrUsers = users.filter(u => u.role === 'hr');

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>Manage Users</Text>
          <Text style={[styles.subtitle, { color: theme.subtext }]}>
            {users.length} user{users.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity
            style={[styles.archiveButton, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => router.push('/(app)/superuser/archive' as any)}
          >
            <Archive color={colors.yellow} size={18} />
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>
              Archive{archivedCount > 0 ? ` (${archivedCount})` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/(app)/superuser/create-user' as any)}
          >
            <Plus color={colors.black} size={22} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Admins Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Admins ({admins.length})
        </Text>
        {admins.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.emptyText, { color: theme.subtext }]}>No admins yet</Text>
          </View>
        ) : (
          admins.map(user => (
            <UserCard
              key={user.id}
              user={user}
              theme={theme}
              isDark={isDark}
              getRoleIcon={getRoleIcon}
              getRoleBadgeColor={getRoleBadgeColor}
              getRoleTextColor={getRoleTextColor}
              onEdit={() => router.push({ pathname: '/(app)/superuser/edit-user', params: { id: user.id } } as any)}
              onDelete={() => askArchive(user.id, user.full_name)}
            />
          ))
        )}
      </View>

      {/* HR Section */}
<View style={styles.section}>
  <Text style={[styles.sectionTitle, { color: theme.text }]}>
    HR ({hrUsers.length})
  </Text>
  {hrUsers.length === 0 ? (
    <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.emptyText, { color: theme.subtext }]}>No HR users yet</Text>
    </View>
  ) : (
    hrUsers.map(user => (
      <UserCard
        key={user.id}
        user={user}
        theme={theme}
        isDark={isDark}
        getRoleIcon={getRoleIcon}
        getRoleBadgeColor={getRoleBadgeColor}
        getRoleTextColor={getRoleTextColor}
        onEdit={() => router.push({ pathname: '/(app)/superuser/edit-user', params: { id: user.id } } as any)}
        onDelete={() => askArchive(user.id, user.full_name)}
      />
    ))
  )}
</View>

      {/* Technicians Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Technicians ({technicians.length})
        </Text>
        {technicians.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.emptyText, { color: theme.subtext }]}>No technicians yet</Text>
          </View>
        ) : (
          technicians.map(user => (
            <UserCard
              key={user.id}
              user={user}
              theme={theme}
              isDark={isDark}
              getRoleIcon={getRoleIcon}
              getRoleBadgeColor={getRoleBadgeColor}
              getRoleTextColor={getRoleTextColor}
              onEdit={() => router.push({ pathname: '/(app)/superuser/edit-user', params: { id: user.id } } as any)}
              onDelete={() => askArchive(user.id, user.full_name)}
            />
          ))
        )}
      </View>

      <Modal visible={!!archiveTarget} transparent animationType="fade" onRequestClose={() => setArchiveTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Archive {archiveTarget?.name}?</Text>
            <Text style={[styles.modalText, { color: theme.subtext }]}>
              They will no longer be able to sign in and will disappear from all lists. Nothing is deleted:
              their profile, documents and forms are kept in the Archive, and you can reactivate them at any time.
            </Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.avatarBg, borderColor: theme.border, color: theme.text }]}
              placeholder="Reason (optional), e.g. Resigned 30 Nov 2026"
              placeholderTextColor={theme.muted}
              value={archiveReason}
              onChangeText={setArchiveReason}
              multiline
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.avatarBg }]} onPress={() => setArchiveTarget(null)} disabled={archiving}>
                <Text style={{ color: theme.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.yellow, opacity: archiving ? 0.6 : 1 }]} onPress={confirmArchive} disabled={archiving}>
                {archiving ? <ActivityIndicator color="#111827" /> : <Text style={{ color: '#111827', fontWeight: '800' }}>Archive</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function UserCard({ user, theme, isDark, getRoleIcon, getRoleBadgeColor, getRoleTextColor, onEdit, onDelete }: any) {
  return (
    <View style={[styles.userCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.userHeader}>
        <Avatar fallback="icon" url={user.avatar_url} name={user.full_name} size={46} backgroundColor={theme.avatarBg} />
        <View style={styles.userInfo}>
          <Text style={[styles.userName, { color: theme.text }]}>{user.full_name}</Text>
          <View style={[styles.roleBadge, { backgroundColor: getRoleBadgeColor(user.role) }]}>
            {getRoleIcon(user.role)}
            <Text style={[styles.roleText, { color: getRoleTextColor(user.role) }]}>
              {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.avatarBg }]} onPress={onEdit}>
            <Edit color={colors.yellow} size={16} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isDark ? '#3b2a0a' : '#fef3c7' }]} onPress={onDelete}>
            <Archive color="#f59e0b" size={16} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  archiveButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 44, borderRadius: 22, borderWidth: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 420, borderRadius: 18, borderWidth: 1, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  modalText: { fontSize: 14, lineHeight: 20, marginBottom: 14 },
  modalInput: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 70, fontSize: 14, textAlignVertical: 'top' },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBtn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingTop: 60,
  },
  title: { fontSize: 28, fontWeight: '800' },
  subtitle: { fontSize: 14, marginTop: 4 },
  addButton: {
    backgroundColor: colors.yellow,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  emptyCard: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyText: { fontSize: 14 },
  userCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  userHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 4,
  },
  roleText: { fontSize: 12, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});