import { Redirect, Stack } from 'expo-router';
import { useAccess } from '../../context/AccessContext';

export default function AuthLayout() {
  const { loading, userId, role, homeRoute } = useAccess();

  // Already signed in? Don't show the login page, go to the app.
  if (!loading && userId && role && homeRoute) {
    return <Redirect href={homeRoute as any} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
    </Stack>
  );
}
