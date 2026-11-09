import { useEffect } from 'react';
import { ActivityIndicator, Platform, View, useColorScheme } from 'react-native';
import { Redirect, Stack, usePathname } from 'expo-router';
import { useAccess } from '../../context/AccessContext';

export default function AppLayout() {
  const isDark = useColorScheme() === 'dark';
  const { loading, userId } = useAccess();
  const pathname = usePathname();

  // Remember the last page (web) so reopening the app can put you back there.
  useEffect(() => {
    if (Platform.OS === 'web' && userId && pathname && pathname !== '/') {
      try { localStorage.setItem(`tki:lastPath:${userId}`, pathname); } catch {}
    }
  }, [userId, pathname]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#000000' : '#f8fafc' }}>
        <ActivityIndicator color="#fbbf24" size="large" />
      </View>
    );
  }

  // Not signed in (e.g. session expired): go to login instead of a "no access" page.
  if (!userId) return <Redirect href={'/(auth)/login' as any} />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="superuser" />
      <Stack.Screen name="superuser/manage-users" />
      <Stack.Screen name="superuser/create-user" />
      <Stack.Screen name="superuser/edit-user" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="technician" />
      <Stack.Screen name="hr" />
      <Stack.Screen name="hr/sites" />
      <Stack.Screen name="hr/employees" />
      <Stack.Screen name="hr/forms" />
      <Stack.Screen name="hr/documents" />
      <Stack.Screen name="hr/requests" />
      <Stack.Screen name="hr/branches" />
      <Stack.Screen name="shared/forms" />
<Stack.Screen name="shared/my-requests" />
<Stack.Screen name="shared/submit-form/[id]" />
<Stack.Screen name="shared/my-approvals" />
      <Stack.Screen name="hr/approval-chains" />
      <Stack.Screen name="hr/documents" />
<Stack.Screen name="shared/my-documents" />
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="callouts" />
      <Stack.Screen name="calender" />
    </Stack>
  );
}