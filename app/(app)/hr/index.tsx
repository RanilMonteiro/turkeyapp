import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { Users, FileText, FolderOpen, ClipboardList, MapPin, GitBranch, LogOut } from 'lucide-react-native';
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

export default function HRDashboard() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [fullName, setFullName] = useState('');

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    text: isDark ? colors.white : '#1e293b',
    subtext: isDark ? colors.gray[400] : colors.gray[500],
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userData.user.id)
      .single();
    if (profile) setFullName(profile.full_name ?? '');
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/(auth)/login' as any);
  }

  const features = [
    {
      id: 'employees',
      title: 'Employees',
      icon: Users,
      description: 'Manage employee profiles',
      route: '/(app)/hr/employees',
    },
    {
      id: 'forms',
      title: 'Forms',
      icon: ClipboardList,
      description: 'Create and manage forms',
      route: '/(app)/hr/forms',
    },
    {
      id: 'documents',
      title: 'Documents',
      icon: FolderOpen,
      description: 'Upload and manage documents',
      route: '/(app)/hr/documents',
    },
    {
      id: 'requests',
      title: 'Requests',
      icon: FileText,
      description: 'View all form submissions',
      route: '/(app)/hr/requests',
    },
    {
      id: 'sites',
      title: 'Sites',
      icon: MapPin,
      description: 'Manage company sites',
      route: '/(app)/hr/sites',
    },
    {
      id: 'approval-chains',
      title: 'Approval Chains',
      icon: GitBranch,
      description: 'Set up approval workflows',
      route: '/(app)/hr/approval-chains',
    },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card }]}>
        <View>
          <Text style={[styles.greeting, { color: theme.subtext }]}>Welcome back,</Text>
          <Text style={[styles.title, { color: isDark ? colors.yellow : '#1e293b' }]}>
            {fullName || 'HR'}
          </Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <LogOut color={colors.yellow} size={24} />
        </TouchableOpacity>
      </View>

      {/* Role Badge */}
      <View style={[styles.roleBadge, { backgroundColor: '#8b5cf6' }]}>
        <Text style={styles.roleText}>HR</Text>
      </View>

      {/* Features Grid */}
      <View style={styles.grid}>
        {features.map((feature) => (
          <TouchableOpacity
            key={feature.id}
            style={[styles.card, {
              backgroundColor: theme.card,
              borderTopColor: colors.yellow,
            }]}
            onPress={() => router.push(feature.route as any)}
            activeOpacity={0.8}
          >
            <View style={[styles.iconContainer, { backgroundColor: `${colors.yellow}20` }]}>
              <feature.icon color={colors.yellow} size={32} />
            </View>
            <Text style={[styles.featureTitle, { color: isDark ? colors.gray[200] : '#1e293b' }]}>
              {feature.title}
            </Text>
            <Text style={[styles.featureDescription, { color: theme.subtext }]}>
              {feature.description}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingTop: 60,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  greeting: { fontSize: 16 },
  title: { fontSize: 28, fontWeight: 'bold' },
  logoutButton: { padding: 8 },
  roleBadge: {
    alignSelf: 'flex-start',
    marginLeft: 24,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 16,
  },
  roleText: { color: colors.white, fontWeight: '600', fontSize: 14 },
  grid: { padding: 16, gap: 16 },
  card: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    borderTopWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  featureTitle: { fontSize: 20, fontWeight: '600', marginBottom: 8 },
  featureDescription: { fontSize: 14, textAlign: 'center' },
});