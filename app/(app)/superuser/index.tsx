import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { User, FileText, Calendar, BarChart3, LogOut, Users, Settings, MapPin, CheckCircle } from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';

const colors = {
  yellow: '#fbbf24',
  white: '#ffffff',
  black: '#000000',
  gray: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  }
};

export default function SuperuserDashboard() {
  const router = useRouter();
  const isDarkMode = useColorScheme() === 'dark';

  const features = [
  {
    id: 'manage-users',
    title: 'Manage Users',
    icon: Users,
    description: 'Create, edit and assign roles',
    route: '/(app)/superuser/manage-users',
  },
  {
    id: 'callouts',
    title: 'Callouts',
    icon: FileText,
    description: 'Manage all callouts',
    route: '/(app)/callouts/(admin)/dashboard',
  },
  // Same HR-level features HR has access to — RLS already grants
  // superuser the same access everywhere, this just wires up the UI.
  {
    id: 'employees',
    title: 'Employees',
    icon: Users,
    description: 'Manage employee profiles',
    route: '/(app)/hr/employees',
  },
  {
    id: 'requests',
    title: 'Requests',
    icon: FileText,
    description: 'View all form submissions',
    route: '/(app)/hr/requests',
  },
  {
    id: 'approvals',
    title: 'My Approvals',
    icon: CheckCircle,
    description: 'Requests waiting for your approval',
    route: '/(app)/shared/my-approvals',
  },
  {
    id: 'sites',
    title: 'Sites',
    icon: MapPin,
    description: 'Manage company sites',
    route: '/(app)/hr/sites',
  },
];

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/(auth)/login' as any);
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: isDarkMode ? colors.black : colors.gray[50] }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: isDarkMode ? colors.gray[900] : colors.white }]}>
        <View>
          <Text style={[styles.greeting, { color: isDarkMode ? colors.gray[400] : colors.gray[500] }]}>
            Welcome to
          </Text>
          <Text style={[styles.title, { color: isDarkMode ? colors.yellow : colors.gray[800] }]}>
            TKI Callouts
          </Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <LogOut color={colors.yellow} size={24} />
        </TouchableOpacity>
      </View>

      {/* Role Badge */}
      <View style={[styles.roleBadge, { backgroundColor: colors.yellow }]}>
        <Text style={styles.roleText}>Super User</Text>
      </View>

      {/* Features Grid */}
      <View style={styles.grid}>
        {features.map((feature) => (
          <TouchableOpacity
            key={feature.id}
            style={[styles.card, {
              backgroundColor: isDarkMode ? colors.gray[900] : colors.white,
              borderTopColor: colors.yellow,
            }]}
            onPress={() => router.push(feature.route as any)}
            activeOpacity={0.8}
          >
            <View style={[styles.iconContainer, { backgroundColor: `${colors.yellow}20` }]}>
              <feature.icon color={colors.yellow} size={32} />
            </View>
            <Text style={[styles.featureTitle, { color: isDarkMode ? colors.gray[200] : colors.gray[800] }]}>
              {feature.title}
            </Text>
            <Text style={[styles.featureDescription, { color: isDarkMode ? colors.gray[400] : colors.gray[500] }]}>
              {feature.description}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  greeting: {
    fontSize: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  logoutButton: {
    padding: 8,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    marginLeft: 24,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  roleText: {
    color: colors.black,
    fontWeight: '600',
    fontSize: 14,
  },
  grid: {
    padding: 16,
    gap: 16,
  },
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
  featureTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  featureDescription: {
    fontSize: 14,
    textAlign: 'center',
  },
});