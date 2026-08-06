import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator,
  Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { User, Plus, Edit, Trash2, Shield, Wrench } from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { Platform } from 'react-native';

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
  role: 'superuser' | 'admin' | 'technician';
  site_id: string | null;
};

export default function ManageUsers() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

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
      .order('full_name', { ascending: true });

    if (!error && data) setUsers(data);
    setLoading(false);
  }

async function deleteUser(userId: string, name: string) {
  const performDelete = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'delete', user_id: userId }),
      }
    );

    const result = await response.json();
    if (result.success) {
      if (Platform.OS === 'web') {
        window.alert(`${name} has been removed.`);
      } else {
        Alert.alert('Deleted', `${name} has been removed.`);
      }
      fetchUsers();
    } else {
      if (Platform.OS === 'web') {
        window.alert(`Error: ${result.error}`);
      } else {
        Alert.alert('Error', result.error);
      }
    }
  };

  if (Platform.OS === 'web') {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${name}? This cannot be undone.`
    );
    if (confirmed) {
      await performDelete();
    }
  } else {
    Alert.alert(
      'Delete User',
      `Are you sure you want to delete ${name}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: performDelete },
      ]
    );
  }
}

  function getRoleIcon(role: string) {
    if (role === 'admin') return <Shield color={colors.yellow} size={18} />;
    return <Wrench color={colors.yellow} size={18} />;
  }

  function getRoleBadgeColor(role: string) {
    if (role === 'admin') return isDark ? '#1e3a5f' : '#dbeafe';
    return isDark ? '#1a2e1a' : '#d1fae5';
  }

  function getRoleTextColor(role: string) {
    if (role === 'admin') return '#3b82f6';
    return '#10b981';
  }

  const admins = users.filter(u => u.role === 'admin');
  const technicians = users.filter(u => u.role === 'technician');

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
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/(app)/superuser/create-user' as any)}
        >
          <Plus color={colors.black} size={22} />
        </TouchableOpacity>
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
              onDelete={() => deleteUser(user.id, user.full_name)}
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
              onDelete={() => deleteUser(user.id, user.full_name)}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

function UserCard({ user, theme, isDark, getRoleIcon, getRoleBadgeColor, getRoleTextColor, onEdit, onDelete }: any) {
  return (
    <View style={[styles.userCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.userHeader}>
        <View style={[styles.avatar, { backgroundColor: theme.avatarBg }]}>
          <User size={22} color={colors.yellow} />
        </View>
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
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isDark ? '#3b1a1a' : '#fee2e2' }]} onPress={onDelete}>
            <Trash2 color="#ef4444" size={16} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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