import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, useWindowDimensions, Platform
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import {
  LayoutDashboard, Users, FileText, FolderOpen,
  ClipboardList, MapPin, GitBranch, LogOut,
  Menu, X, CheckCircle, Calendar
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

type NavItem = {
  label: string;
  icon: any;
  route: string;
};

const navByRole: Record<string, NavItem[]> = {
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
    { label: 'Callouts', icon: FileText, route: '/(app)/callouts/(technician)/jobs' },
    { label: 'Forms', icon: ClipboardList, route: '/(app)/shared/forms' },
    { label: 'My Requests', icon: ClipboardList, route: '/(app)/shared/my-requests' },
    { label: 'My Documents', icon: FolderOpen, route: '/(app)/shared/my-documents' },
  ],
};

type Props = {
  children: React.ReactNode;
  role: string;
  fullName: string;
  isDark: boolean;
};

export default function WebLayout({ children, role, fullName, isDark }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const isWeb = Platform.OS === 'web';
  const isDesktop = width >= 768;

  // On mobile just render children
  if (!isWeb || !isDesktop) {
    return <>{children}</>;
  }

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    sidebar: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    text: isDark ? colors.white : '#1e293b',
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    muted: isDark ? colors.gray[500] : colors.gray[400],
    hover: isDark ? colors.gray[800] : colors.gray[100],
    active: isDark ? '#1a1500' : '#fef9e7',
  };

  const navItems = navByRole[role] ?? [];

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/(auth)/login' as any);
  }

  return (
    <View style={[webStyles.root, { backgroundColor: theme.background }]}>
      {/* Sidebar */}
      {sidebarOpen && (
        <View style={[webStyles.sidebar, { backgroundColor: theme.sidebar, borderRightColor: theme.border }]}>
          {/* Logo */}
          <View style={[webStyles.sidebarLogo, { borderBottomColor: theme.border }]}>
            <View style={webStyles.logoBox}>
              <Text style={webStyles.logoText}>T</Text>
            </View>
            <Text style={[webStyles.logoName, { color: isDark ? colors.yellow : '#1e293b' }]}>
              TURNKEY
            </Text>
          </View>

          {/* User */}
          <View style={[webStyles.userSection, { borderBottomColor: theme.border }]}>
            <View style={[webStyles.userAvatar, { backgroundColor: `${colors.yellow}20` }]}>
              <Text style={[webStyles.userAvatarText, { color: colors.yellow }]}>
                {fullName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={webStyles.userInfo}>
              <Text style={[webStyles.userName, { color: theme.text }]} numberOfLines={1}>
                {fullName}
              </Text>
              <View style={[webStyles.rolePill, { backgroundColor: `${colors.yellow}20` }]}>
                <Text style={[webStyles.rolePillText, { color: colors.yellow }]}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </Text>
              </View>
            </View>
          </View>

          {/* Nav Items */}
          <ScrollView style={webStyles.navList} showsVerticalScrollIndicator={false}>
            {navItems.map((item) => {
              const isActive = pathname === item.route || pathname.startsWith(item.route + '/');
              return (
                <TouchableOpacity
                  key={item.route}
                  style={[
                    webStyles.navItem,
                    { backgroundColor: isActive ? `${colors.yellow}20` : 'transparent' }
                  ]}
                  onPress={() => router.push(item.route as any)}
                >
                  <item.icon
                    color={isActive ? colors.yellow : theme.muted}
                    size={18}
                  />
                  <Text style={[
                    webStyles.navLabel,
                    { color: isActive ? colors.yellow : theme.subtext, fontWeight: isActive ? '700' : '500' }
                  ]}>
                    {item.label}
                  </Text>
                  {isActive && (
                    <View style={webStyles.activeIndicator} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Logout */}
          <TouchableOpacity
            style={[webStyles.logoutBtn, { borderTopColor: theme.border }]}
            onPress={handleLogout}
          >
            <LogOut color={theme.muted} size={18} />
            <Text style={[webStyles.logoutText, { color: theme.subtext }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Main Content */}
      <View style={webStyles.main}>
        {/* Top Bar */}
        <View style={[webStyles.topBar, { backgroundColor: theme.sidebar, borderBottomColor: theme.border }]}>
          <TouchableOpacity
            style={webStyles.menuBtn}
            onPress={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen
              ? <X color={theme.subtext} size={20} />
              : <Menu color={theme.subtext} size={20} />
            }
          </TouchableOpacity>
          <Text style={[webStyles.topBarTitle, { color: theme.text }]}>
            {navItems.find(n => pathname === n.route || pathname.startsWith(n.route + '/'))?.label ?? 'Dashboard'}
          </Text>
        </View>

        {/* Page Content */}
        <ScrollView style={webStyles.content} contentContainerStyle={webStyles.contentInner}>
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

const webStyles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    height: '100%' as any,
  },
  sidebar: {
    width: 240,
    borderRightWidth: 1,
    flexDirection: 'column',
  },
  sidebarLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    gap: 10,
  },
  logoBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: colors.black, fontWeight: '800', fontSize: 16 },
  logoName: { fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    gap: 10,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: { fontSize: 16, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  rolePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, alignSelf: 'flex-start' },
  rolePillText: { fontSize: 11, fontWeight: '600' },
  navList: { flex: 1, padding: 8 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    marginBottom: 2,
    gap: 10,
    position: 'relative',
  },
  navLabel: { fontSize: 14, flex: 1 },
  activeIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.yellow,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderTopWidth: 1,
    gap: 10,
  },
  logoutText: { fontSize: 14 },
  main: { flex: 1, flexDirection: 'column' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  menuBtn: { padding: 4 },
  topBarTitle: { fontSize: 16, fontWeight: '700' },
  content: { flex: 1 },
  contentInner: { flexGrow: 1 },
});