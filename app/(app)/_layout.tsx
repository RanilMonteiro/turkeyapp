import { Stack } from 'expo-router';

export default function AppLayout() {
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
      <Stack.Screen name="calendar" />
      <Stack.Screen name="reports" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}