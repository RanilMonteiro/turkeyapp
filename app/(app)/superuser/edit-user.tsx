import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, TextInput,
  ActivityIndicator, Switch
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';
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

// Kept in sync with create-user.tsx — same permission set, same
// no-longer-artificially-locked toggles.
const ALL_PERMISSIONS = [
  { key: 'view_callouts', label: 'Callouts (Admin)', description: 'Manage and create callouts' },
  { key: 'view_callouts_tech', label: 'Callouts (Technician view)', description: 'Accept and complete jobs like a technician' },
  { key: 'view_calendar', label: 'Calendar', description: 'Access the job calendar' },
  { key: 'manage_team', label: 'Manage Team', description: 'View and manage technicians' },
  { key: 'view_reports', label: 'View Reports', description: 'Access reports and analytics' },
];

export default function EditUser() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const isDark = useColorScheme() === 'dark';

  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'admin' | 'technician' | 'hr'>('technician');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    input: isDark ? colors.gray[800] : colors.gray[50],
    text: isDark ? colors.white : colors.gray[800],
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    label: isDark ? colors.gray[400] : colors.gray[500],
  };

  useEffect(() => {
    if (id) fetchUser();
  }, [id]);

  async function fetchUser() {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    const { data: perms } = await supabase
      .from('user_permissions')
      .select('permission')
      .eq('user_id', id)
      .eq('granted', true);

    if (profile) {
      setFullName(profile.full_name ?? '');
      setRole(profile.role);
    }

    if (perms) {
      setPermissions(perms.map((p: any) => p.permission));
    }

    setLoading(false);
  }

  function togglePermission(key: string) {
    setPermissions(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
    );
  }

  function selectRole(newRole: 'admin' | 'technician' | 'hr') {
    setRole(newRole);
    // Permissions only mean anything for admin — clear them out when
    // switching away so a stale selection doesn't get silently saved
    // against a technician or HR account.
    if (newRole !== 'admin') setPermissions([]);
  }

  async function handleSave() {
    if (!fullName) {
      notify('Missing fields', 'Please enter a full name.');
      return;
    }

    if (newPassword && newPassword.length < 6) {
      notify('Weak password', 'Password must be at least 6 characters.');
      return;
    }

    setSaving(true);

    const { data: { session } } = await supabase.auth.getSession();

    const payload: any = {
      action: 'update',
      user_id: id,
      full_name: fullName,
      role,
      permissions: role === 'admin' ? permissions : [],
    };

    if (newPassword) payload.password = newPassword;

    const response = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json();
    setSaving(false);

    if (result.success) {
      notify('Saved', 'User has been updated.', () => router.back());
    } else {
      notify('Error', result.error || 'Something went wrong.');
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
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft color={colors.yellow} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Edit User</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.label }]}>FULL NAME *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
            placeholder="Full name"
            placeholderTextColor={theme.subtext}
            value={fullName}
            onChangeText={setFullName}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.label }]}>NEW PASSWORD</Text>
          <Text style={[styles.hint, { color: theme.subtext }]}>Leave blank to keep current password</Text>
          <View style={[styles.inputRow, { backgroundColor: theme.input, borderColor: theme.border }]}>
            <TextInput
              style={[styles.inputFlex, { color: theme.text }]}
              placeholder="Enter new password"
              placeholderTextColor={theme.subtext}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Text style={[styles.toggle, { color: colors.yellow }]}>
                {showPassword ? 'Hide' : 'Show'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.label }]}>ROLE *</Text>
          <View style={styles.roleRow}>
            <TouchableOpacity
              style={[
                styles.roleBtn,
                { borderColor: theme.border, backgroundColor: theme.input },
                role === 'technician' && styles.roleBtnActive,
              ]}
              onPress={() => selectRole('technician')}
            >
              <Text style={[styles.roleBtnText, { color: theme.subtext }, role === 'technician' && styles.roleBtnTextActive]}>
                Technician
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.roleBtn,
                { borderColor: theme.border, backgroundColor: theme.input },
                role === 'admin' && styles.roleBtnActive,
              ]}
              onPress={() => selectRole('admin')}
            >
              <Text style={[styles.roleBtnText, { color: theme.subtext }, role === 'admin' && styles.roleBtnTextActive]}>
                Admin
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.roleBtn,
                { borderColor: theme.border, backgroundColor: theme.input },
                role === 'hr' && styles.roleBtnActive,
              ]}
              onPress={() => selectRole('hr')}
            >
              <Text style={[styles.roleBtnText, { color: theme.subtext }, role === 'hr' && styles.roleBtnTextActive]}>
                HR
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Permissions only apply to admin — technicians and HR use their
          own fixed screens and don't need this. */}
      {role === 'admin' && (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Permissions</Text>
          <Text style={[styles.sectionSubtitle, { color: theme.subtext }]}>
            Control what this admin can access. Checking both Callout options shows both the
            admin management view and the technician job-accepting view on their dashboard.
          </Text>

          {ALL_PERMISSIONS.map((perm) => (
            <View
              key={perm.key}
              style={[styles.permRow, { borderBottomColor: theme.border }]}
            >
              <View style={styles.permInfo}>
                <Text style={[styles.permLabel, { color: theme.text }]}>
                  {perm.label}
                </Text>
                <Text style={[styles.permDesc, { color: theme.subtext }]}>
                  {perm.description}
                </Text>
              </View>
              <Switch
                value={permissions.includes(perm.key)}
                onValueChange={() => togglePermission(perm.key)}
                trackColor={{ false: isDark ? colors.gray[700] : colors.gray[200], true: `${colors.yellow}80` }}
                thumbColor={permissions.includes(perm.key) ? colors.yellow : colors.gray[400]}
              />
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={[styles.submitButton, saving && { opacity: 0.6 }]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.85}
      >
        {saving
          ? <ActivityIndicator color={colors.black} />
          : <Text style={styles.submitText}>Save Changes</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingBottom: 48 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  card: {
    margin: 16,
    marginBottom: 0,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
  },
  fieldGroup: { marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, marginBottom: 8 },
  hint: { fontSize: 12, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
  },
  inputFlex: { flex: 1, fontSize: 15 },
  toggle: { fontSize: 13, fontWeight: '600' },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleBtnActive: {
    backgroundColor: colors.yellow,
    borderColor: colors.yellow,
  },
  roleBtnText: { fontSize: 13, fontWeight: '600' },
  roleBtnTextActive: { color: colors.black },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  sectionSubtitle: { fontSize: 13, marginBottom: 16 },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  permInfo: { flex: 1, marginRight: 12 },
  permLabel: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  permDesc: { fontSize: 12 },
  submitButton: {
    backgroundColor: colors.yellow,
    borderRadius: 14,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
    marginTop: 20,
  },
  submitText: { color: colors.black, fontSize: 16, fontWeight: '700' },
});