import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { LogOut, Bell } from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';
import { useAccess } from '../../../context/AccessContext';
import Avatar from '../../../components/Avatar';

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
  const { fullName, avatarUrl, dashboardFeatures: features } = useAccess();

  // Leave forms that have been fully approved / declined and still need HR action
  const [pendingActions, setPendingActions] = useState(0);

  const loadPending = useCallback(async () => {
    const { count } = await supabase
      .from('hr_notifications')
      .select('id', { count: 'exact', head: true })
      .is('actioned_at', null);
    setPendingActions(count ?? 0);
  }, []);

  useFocusEffect(useCallback(() => { loadPending(); }, [loadPending]));

  useEffect(() => {
    // Update the banner live when a new leave outcome arrives
    const channel = supabase
      .channel('hr-leave-actions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hr_notifications' }, () => loadPending())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadPending]);

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    text: isDark ? colors.white : '#1e293b',
    subtext: isDark ? colors.gray[400] : colors.gray[500],
  };

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/(auth)/login' as any);
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card }]}>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}
          onPress={() => router.push('/(app)/my-profile' as any)}
          activeOpacity={0.8}
        >
          <Avatar url={avatarUrl} name={fullName} size={52} />
          <View style={{ flexShrink: 1 }}>
            <Text style={[styles.greeting, { color: theme.subtext }]}>Welcome back,</Text>
            <Text style={[styles.title, { color: isDark ? colors.yellow : '#1e293b' }]}>
              {fullName || 'HR'}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <LogOut color={colors.yellow} size={24} />
        </TouchableOpacity>
      </View>

      {/* Role Badge */}
      <View style={[styles.roleBadge, { backgroundColor: '#8b5cf6' }]}>
        <Text style={styles.roleText}>HR</Text>
      </View>

      {/* Leave outcomes waiting for HR to action */}
      {pendingActions > 0 && (
        <TouchableOpacity
          style={[styles.alertBanner, { backgroundColor: `${colors.yellow}22`, borderColor: colors.yellow }]}
          onPress={() => router.push('/(app)/hr/leave-actions' as any)}
          activeOpacity={0.85}
        >
          <Bell color={colors.yellow} size={22} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>
              {pendingActions} leave form{pendingActions !== 1 ? 's' : ''} need{pendingActions === 1 ? 's' : ''} HR action
            </Text>
            <Text style={{ color: theme.subtext, fontSize: 12.5 }}>Fully approved or declined — tap to action</Text>
          </View>
        </TouchableOpacity>
      )}

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
  alertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginBottom: 4, padding: 14,
    borderRadius: 14, borderWidth: 1,
  },
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