import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { User, FileText, Calendar, BarChart3, LogOut } from 'lucide-react-native';
import { useRole } from '../../../hooks/useRole';

// Company colors
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

export default function Dashboard() {
  const router = useRouter();
  const { role, isAdmin, isSuperuser } = useRole();
  const systemColorScheme = useColorScheme();
  
  // Determine if we're in dark mode
  const isDarkMode = systemColorScheme === 'dark';

  const getRoleBadgeColor = () => {
    return colors.yellow; // Use yellow for all roles
  };

  const getRoleDisplayName = () => {
    switch(role) {
      case 'technician': return 'Technician';
      case 'admin': return 'Admin';
      case 'superuser': return 'Super User';
      default: return '';
    }
  };

  const features = [
    {
      id: 'profile',
      title: 'Profile',
      icon: User,
      description: 'Your documents and team',
      route: '/(app)/profile',
      color: colors.yellow,
      show: true
    },
    {
      id: 'callouts',
      title: 'Callouts',
      icon: FileText,
      description: role === 'technician' ? 'My assigned callouts' : 'Manage callouts',
      route: '/(app)/callouts',
      color: colors.yellow,
      show: true
    },
    {
      id: 'calendar',
      title: 'Calendar',
      icon: Calendar,
      description: role === 'technician' ? 'My schedule & leave' : 'Team schedule',
      route: '/(app)/calendar',
      color: colors.yellow,
      show: true
    },
    {
      id: 'reports',
      title: 'Reports',
      icon: BarChart3,
      description: 'Analytics and insights',
      route: '/(app)/reports',
      color: colors.yellow,
      show: isAdmin || isSuperuser
    },
  ];

  const handleLogout = () => {
    router.replace('/');
  };

  const handleFeaturePress = (route: string) => {
    router.push(route as any);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: isDarkMode ? colors.black : colors.gray[50] }]}>
      {/* Header with Role Badge */}
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

      {/* Role Indicator */}
      <View style={[styles.roleBadge, { backgroundColor: getRoleBadgeColor() }]}>
        <Text style={styles.roleText}>{getRoleDisplayName()}</Text>
      </View>

      {/* Features Grid */}
      <View style={styles.grid}>
        {features
          .filter(f => f.show)
          .map((feature) => (
            <TouchableOpacity
              key={feature.id}
              style={[styles.card, { 
                backgroundColor: isDarkMode ? colors.gray[900] : colors.white,
                borderTopColor: feature.color 
              }]}
              onPress={() => handleFeaturePress(feature.route)}
            >
              <View style={[styles.iconContainer, { backgroundColor: isDarkMode ? `${colors.yellow}20` : `${colors.yellow}20` }]}>
                <feature.icon color={feature.color} size={32} />
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
    color: '#000000',
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