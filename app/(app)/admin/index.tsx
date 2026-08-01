import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { User, FileText, Calendar, BarChart3, LogOut, Users, ClipboardList, CheckCircle, FolderOpen, Eye } from 'lucide-react-native';
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

export default function AdminDashboard() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [fullName, setFullName] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [hasDocGrants, setHasDocGrants] = useState(false);

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

    const { data: perms } = await supabase
      .from('user_permissions')
      .select('permission')
      .eq('user_id', userData.user.id)
      .eq('granted', true);

    // "See Docs" only shows up for admins HR has actually granted
    // document access to — not every admin needs this card.
    const { data: grants } = await supabase
      .from('document_access_grants')
      .select('id')
      .eq('admin_id', userData.user.id)
      .limit(1);

    if (profile) setFullName(profile.full_name ?? '');
    if (perms) setPermissions(perms.map(p => p.permission));
    setHasDocGrants((grants?.length ?? 0) > 0);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/(auth)/login' as any);
  }

  const allFeatures = [
    {
      id: 'callouts',
      title: 'Callouts',
      icon: FileText,
      description: 'Manage and create callouts',
      route: '/(app)/callouts/(admin)/dashboard',
      permission: 'view_callouts',
    },
    {
      id: 'calendar',
      title: 'Calendar',
      icon: Calendar,
      description: 'View callout schedule',
      route: '/(app)/callouts/(admin)/calendar',
      permission: 'view_calendar',
    },
    {
  id: 'forms',
  title: 'Forms',
  icon: ClipboardList,
  description: 'Submit leave and other requests',
  route: '/(app)/shared/forms',
  permission: null,
},
{
  id: 'my-requests',
  title: 'My Requests',
  icon: FileText,
  description: 'Track your submissions',
  route: '/(app)/shared/my-requests',
  permission: null,
},
{
  id: 'approvals',
  title: 'Approvals',
  icon: CheckCircle,
  description: 'Requests waiting for your approval',
  route: '/(app)/shared/my-approvals',
  permission: null,
},
    {
      id: 'team',
      title: 'Technicians',
      icon: Users,
      description: 'View your field team',
      route: '/(app)/callouts/(admin)/technicians',
      permission: 'manage_team',
    },
    {
  id: 'documents',
  title: 'My Documents',
  icon: FolderOpen,
  description: 'View your HR documents',
  route: '/(app)/shared/my-documents',
  permission: null,
},
    ...(hasDocGrants ? [{
      id: 'see-docs',
      title: 'See Docs',
      icon: Eye,
      description: 'Documents you have been granted access to',
      route: '/(app)/shared/granted-documents',
      permission: null,
    }] : []),
    {
      id: 'reports',
      title: 'Reports',
      icon: BarChart3,
      description: 'Analytics and insights',
      route: '/(app)/reports',
      permission: 'view_reports',
    },
   
  ];

  const features = allFeatures.filter(f =>
    f.permission === null || permissions.includes(f.permission)
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: isDark ? colors.black : colors.gray[50] }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: isDark ? colors.gray[900] : colors.white }]}>
        <View>
          <Text style={[styles.greeting, { color: isDark ? colors.gray[400] : colors.gray[500] }]}>
            Welcome back,
          </Text>
          <Text style={[styles.title, { color: isDark ? colors.yellow : colors.gray[800] }]}>
            {fullName || 'Admin'}
          </Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <LogOut color={colors.yellow} size={24} />
        </TouchableOpacity>
      </View>

      {/* Role Badge */}
      <View style={[styles.roleBadge, { backgroundColor: colors.yellow }]}>
        <Text style={styles.roleText}>Admin</Text>
      </View>

      {/* Features */}
      <View style={styles.grid}>
        {features.map((feature) => (
          <TouchableOpacity
            key={feature.id}
            style={[styles.card, {
              backgroundColor: isDark ? colors.gray[900] : colors.white,
              borderTopColor: colors.yellow,
            }]}
            onPress={() => router.push(feature.route as any)}
            activeOpacity={0.8}
          >
            <View style={[styles.iconContainer, { backgroundColor: `${colors.yellow}20` }]}>
              <feature.icon color={colors.yellow} size={32} />
            </View>
            <Text style={[styles.featureTitle, { color: isDark ? colors.gray[200] : colors.gray[800] }]}>
              {feature.title}
            </Text>
            <Text style={[styles.featureDescription, { color: isDark ? colors.gray[400] : colors.gray[500] }]}>
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
  roleText: { color: colors.black, fontWeight: '600', fontSize: 14 },
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