import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { LogOut } from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';
import { useAccess } from '../../../context/AccessContext';

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

export default function TechnicianDashboard() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const { fullName, dashboardFeatures: features } = useAccess();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/(auth)/login' as any);
  }

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
            {fullName || 'Technician'}
          </Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <LogOut color={colors.yellow} size={24} />
        </TouchableOpacity>
      </View>

      {/* Role Badge */}
      <View style={[styles.roleBadge, { backgroundColor: colors.yellow }]}>
        <Text style={styles.roleText}>Technician</Text>
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