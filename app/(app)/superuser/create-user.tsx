import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, TextInput,
  Alert, ActivityIndicator, Switch
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';

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

const ALL_PERMISSIONS = [
  { key: 'view_callouts', label: 'View Callouts', description: 'See all callouts', enabled: true },
  { key: 'manage_callouts', label: 'Manage Callouts', description: 'Create and edit callouts', enabled: true },
  { key: 'view_reports', label: 'View Reports', description: 'Access reports and analytics', enabled: true },
  { key: 'view_documents', label: 'View Documents', description: 'See uploaded documents', enabled: true },
  { key: 'approve_documents', label: 'Approve Documents', description: 'Sign off on documents', enabled: true },
  { key: 'manage_team', label: 'Manage Team', description: 'View and manage technicians', enabled: true },
];

export default function CreateUser() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<'admin' | 'technician' | 'hr'>('technician');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Clear non-admin permissions automatically when role changes
  useEffect(() => {
    if (role !== 'admin') {
      setPermissions([]);
    }
  }, [role]);


  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    input: isDark ? colors.gray[800] : colors.gray[50],
    text: isDark ? colors.white : colors.gray[800],
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    label: isDark ? colors.gray[400] : colors.gray[500],
  };

  function togglePermission(key: string) {
    setPermissions(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
    );
  }

  async function handleCreate() {
    if (!fullName || !username || !password) {
      Alert.alert('Missing fields', 'Please fill in all required fields.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          action: 'create',
          username,
          password,
          full_name: fullName,
          role,
          permissions,
        }),
      }
    );

    const result = await response.json();
    setLoading(false);

    if (result.success) {
      Alert.alert(
        'User created',
        `${fullName} has been created as ${role}.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } else {
      Alert.alert('Error', result.error || 'Something went wrong.');
    }
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
        <Text style={[styles.headerTitle, { color: theme.text }]}>Create User</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.label }]}>FULL NAME *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
            placeholder="e.g. John Smith"
            placeholderTextColor={theme.subtext}
            value={fullName}
            onChangeText={setFullName}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.label }]}>USERNAME *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
            placeholder="e.g. johnsmith"
            placeholderTextColor={theme.subtext}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={[styles.hint, { color: theme.subtext }]}>
            They'll log in as {username || 'username'}@turnkeyinstruments.co.za
          </Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.label }]}>PASSWORD *</Text>
          <View style={[styles.inputRow, { backgroundColor: theme.input, borderColor: theme.border }]}>
            <TextInput
              style={[styles.inputFlex, { color: theme.text }]}
              placeholder="Min 6 characters"
              placeholderTextColor={theme.subtext}
              value={password}
              onChangeText={setPassword}
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
              onPress={() => setRole('technician')}
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
              onPress={() => setRole('admin')}
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
              onPress={() => setRole('hr')}
            >
              <Text style={[styles.roleBtnText, { color: theme.subtext }, role === 'hr' && styles.roleBtnTextActive]}>
                HR
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Permissions</Text>
        <Text style={[styles.sectionSubtitle, { color: theme.subtext }]}>
          Control what this user can access
        </Text>

        {role !== 'admin' ? (
          <Text style={{ color: theme.subtext, paddingVertical: 8 }}>
            Permissions are managed by admins only. Technicians and HR have no permission controls here.
          </Text>
        ) : (
          ALL_PERMISSIONS.map((perm) => (
          <View
            key={perm.key}
            style={[styles.permRow, { borderBottomColor: theme.border }]}
          >
            <View style={styles.permInfo}>
              <Text style={[styles.permLabel, { color: perm.enabled ? theme.text : theme.subtext }]}>
                {perm.label}
              </Text>
              <Text style={[styles.permDesc, { color: theme.subtext }]}>
                {perm.description}
              </Text>
            </View>
            <Switch
              value={perm.enabled ? permissions.includes(perm.key) : false}
              onValueChange={() => {
                if (perm.enabled) togglePermission(perm.key);
              }}
              disabled={!perm.enabled}
              trackColor={{ false: isDark ? colors.gray[700] : colors.gray[200], true: `${colors.yellow}80` }}
              thumbColor={
                !perm.enabled
                  ? isDark ? colors.gray[700] : colors.gray[400]
                  : permissions.includes(perm.key) ? colors.yellow : colors.gray[400]
              }
            />
          </View>
        ))
        )}
      </View>

      <TouchableOpacity
        style={[styles.submitButton, loading && { opacity: 0.6 }]}
        onPress={handleCreate}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator color={colors.black} />
          : <Text style={styles.submitText}>Create User</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  hint: { fontSize: 12, marginTop: 6 },
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