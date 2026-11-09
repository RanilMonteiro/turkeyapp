import { Redirect } from 'expo-router';
import { ActivityIndicator, Platform, View, useColorScheme } from 'react-native';
import { useAccess } from '../context/AccessContext';

// Entry point (the bare address, a pinned shortcut, "search the app").
// Signed in  -> straight back into the app (last page on web, else home).
// Signed out -> login.
export default function Index() {
  const isDark = useColorScheme() === 'dark';
  const { loading, userId, role, homeRoute } = useAccess();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#000000' : '#f8fafc' }}>
        <ActivityIndicator color="#fbbf24" size="large" />
      </View>
    );
  }

  if (userId && role && homeRoute) {
    let target: string = homeRoute;
    if (Platform.OS === 'web') {
      try {
        const saved = localStorage.getItem(`tki:lastPath:${userId}`);
        if (saved && saved.startsWith('/') && !saved.includes('login')) target = saved;
      } catch {}
    }
    return <Redirect href={target as any} />;
  }

  return <Redirect href={'/(auth)/login' as any} />;
}
