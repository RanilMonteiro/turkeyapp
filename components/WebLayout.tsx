import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Platform, useWindowDimensions,
  useColorScheme
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import {
  LayoutDashboard, Users, FileText, FolderOpen,
  ClipboardList, MapPin, GitBranch, LogOut,
  Menu, X, CheckCircle, Calendar, Wrench
} from 'lucide-react-native';
import { supabase } from '../lib/supabase';

const colors = {
  yellow: '#fbbf24',
  white: '#ffffff',
  black: '#000000',
  gray: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    400: '#94a3b8',
    500: '#64748b',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  }
};

const navByRole: Record<string, { label: string; icon: any; route: string }[]> = {
  superuser: [
    { label: 'Dashboard', icon: LayoutDashboard, route: '/(app)/superuser' },
    { label: 'Manage Users', icon: Users, route: '/(app)/superuser/manage-users' },
    { label: 'Callouts', icon: FileText, route: '/(app)/callouts/(admin)/dashboard' },
  ],
  hr: [
    { label: 'Dashboard', icon: LayoutDashboard, route: '/(app)/hr' },
    { label: 'Employees', icon: Users, route: '/(app)/hr/employees' },
    { label: 'Forms', icon: ClipboardList, route: '/(app)/hr/forms' },
    { label: 'Documents', icon: FolderOpen, route: '/(app)/hr/documents' },
    { label: 'Requests', icon: FileText, route: '/(app)/hr/requests' },
    { label: 'Sites', icon: MapPin, route: '/(app)/hr/sites' },
    { label: 'Approval Chains', icon: GitBranch, route: '/(app)/hr/approval-chains' },
  ],
  admin: [
    { label: 'Dashboard', icon: LayoutDashboard, route: '/(app)/admin' },
    { label: 'Callouts', icon: FileText, route: '/(app)/callouts/(admin)/dashboard' },
    { label: 'Calendar', icon: Calendar, route: '/(app)/callouts/(admin)/calendar' },
    { label: 'Technicians', icon: Users, route: '/(app)/callouts/(admin)/technicians' },
    { label: 'Approvals', icon: CheckCircle, route: '/(app)/shared/my-approvals' },
    { label: 'Forms', icon: ClipboardList, route: '/(app)/shared/forms' },
    { label: 'My Requests', icon: ClipboardList, route: '/(app)/shared/my-requests' },
    { label: 'My Documents', icon: FolderOpen, route: '/(app)/shared/my-documents' },
  ],
  technician: [
    { label: 'Dashboard', icon: LayoutDashboard, route: '/(app)/technician' },
    { label: 'Callouts', icon: Wrench, route: '/(app)/callouts/(technician)/jobs' },
    { label: 'Forms', icon: ClipboardList, route: '/(app)/shared/forms' },
    { label: 'My Requests', icon: ClipboardList, route: '/(app)/shared/my-requests' },
    { label: 'My Documents', icon: FolderOpen, route: '/(app)/shared/my-documents' },
  ],
};

type Props = {
  children: React.ReactNode;
};

export default function WebLayout({ children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isDark = useColorScheme() === 'dark';
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profile, setProfile] = useState<{ role: string; full_name: string } | null>(null);

  const isWeb = Platform.OS === 'web';
  const isDesktop = width >= 768;

  useEffect(() => {
    fetchProfile();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchProfile();
    });
    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { setProfile(null); return; }
    const { data } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', userData.user.id)
      .single();
    if (data) setProfile(data);
  }

  const isAuthScreen = pathname?.includes('auth') || pathname === '/';

  // Only show sidebar on web desktop and when logged in
  if (!isWeb || !isDesktop || !profile || isAuthScreen) {
    return <>{children}</>;
  }

  const theme = {
    background: isDark ? '#0a0a0a' : colors.gray[50],
    sidebar: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    text: isDark ? colors.white : '#1e293b',
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    muted: isDark ? colors.gray[500] : colors.gray[400],
    topbar: isDark ? colors.gray[900] : colors.white,
  };

  const navItems = navByRole[profile.role] ?? [];
  const currentPage = navItems.find(n =>
    pathname === n.route || pathname.startsWith(n.route + '/')
  );

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/(auth)/login' as any);
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>

      {/* Sidebar */}
      {sidebarOpen && (
        <View style={[styles.sidebar, { backgroundColor: theme.sidebar, borderRightColor: theme.border }]}>

          {/* Logo */}
          <View style={[styles.logoRow, { borderBottomColor: theme.border }]}>
            <View style={styles.logoBox}>
              <Text style={styles.logoLetter}>T</Text>
            </View>
            <Text style={[styles.logoName, { color: isDark ? colors.yellow : '#1e293b' }]}>
              TURNKEY
            </Text>
          </View>

          {/* User info */}
          <View style={[styles.userRow, { borderBottomColor: theme.border }]}>
            <View style={[styles.avatar, { backgroundColor: `${colors.yellow}25` }]}>
              <Text style={[styles.avatarText, { color: colors.yellow }]}>
                {profile.full_name?.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={[styles.userName, { color: theme.text }]} numberOfLines={1}>
                {profile.full_name}
              </Text>
              <View style={[styles.rolePill, { backgroundColor: `${colors.yellow}20` }]}>
                <Text style={[styles.rolePillText, { color: colors.yellow }]}>
                  {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
                </Text>
              </View>
            </View>
          </View>

          {/* Nav */}
          <ScrollView style={styles.nav} showsVerticalScrollIndicator={false}>
            <Text style={[styles.navSection, { color: theme.muted }]}>NAVIGATION</Text>
            {navItems.map((item) => {
              const isActive = pathname === item.route || pathname.startsWith(item.route + '/');
              return (
                <TouchableOpacity
                  key={item.route}
                  style={[
                    styles.navItem,
                    isActive && { backgroundColor: `${colors.yellow}15` }
                  ]}
                  onPress={() => router.push(item.route as any)}
                  activeOpacity={0.7}
                >
                  <item.icon
                    color={isActive ? colors.yellow : theme.muted}
                    size={17}
                  />
                  <Text style={[
                    styles.navLabel,
                    {
                      color: isActive ? colors.yellow : theme.subtext,
                      fontWeight: isActive ? '700' : '400',
                    }
                  ]}>
                    {item.label}
                  </Text>
                  {isActive && <View style={styles.activeDot} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Logout */}
          <TouchableOpacity
            style={[styles.logoutRow, { borderTopColor: theme.border }]}
            onPress={handleLogout}
          >
            <LogOut color={theme.muted} size={17} />
            <Text style={[styles.logoutText, { color: theme.subtext }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Main */}
      <View style={styles.main}>

        {/* Top bar */}
        <View style={[styles.topBar, { backgroundColor: theme.topbar, borderBottomColor: theme.border }]}>
          <TouchableOpacity
            style={styles.menuToggle}
            onPress={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen
              ? <X color={theme.muted} size={20} />
              : <Menu color={theme.muted} size={20} />
            }
          </TouchableOpacity>

          <Text style={[styles.pageTitle, { color: theme.text }]}>
            {currentPage?.label ?? 'Dashboard'}
          </Text>

          <View style={styles.topBarRight}>
            <View style={[styles.topBarAvatar, { backgroundColor: `${colors.yellow}20` }]}>
              <Text style={[styles.topBarAvatarText, { color: colors.yellow }]}>
                {profile.full_name?.charAt(0).toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    minHeight: '100vh' as any,
  },
  sidebar: {
    width: 250,
    borderRightWidth: 1,
    flexDirection: 'column',
    minHeight: '100vh' as any,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 10,
    borderBottomWidth: 1,
  },
  logoBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: { color: colors.black, fontWeight: '800', fontSize: 18 },
  logoName: { fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 10,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 17, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  rolePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  rolePillText: { fontSize: 11, fontWeight: '600' },
  nav: { flex: 1, padding: 10 },
  navSection: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 6,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 2,
    gap: 10,
  },
  navLabel: { flex: 1, fontSize: 14 },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.yellow,
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
  },
  logoutText: { fontSize: 14 },
  main: { flex: 1, flexDirection: 'column' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 16,
  },
  menuToggle: { padding: 4 },
  pageTitle: { flex: 1, fontSize: 17, fontWeight: '700' },
  topBarRight: { flexDirection: 'row', alignItems: 'center' },
  topBarAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarAvatarText: { fontSize: 15, fontWeight: '700' },
  content: { flex: 1 },
});