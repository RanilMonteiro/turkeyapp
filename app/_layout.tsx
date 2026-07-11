import { Stack } from 'expo-router';
import { RoleProvider } from '../hooks/useRole';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase } from '../lib/supabase';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import WebLayout from '../components/WebLayout';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotifications() {
  if (!Device.isDevice) return;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return;

  const token = (await Notifications.getExpoPushTokenAsync()).data;

  // Save token to profile
  const { data: userData } = await supabase.auth.getUser();
  if (userData.user) {
    await supabase
      .from('profiles')
      .update({ push_token: token })
      .eq('id', userData.user.id);
  }
}

export default function RootLayout() {
  useEffect(() => {
    registerForPushNotifications();
  }, []);

  return (
    <SafeAreaProvider>
    <RoleProvider>
      <WebLayout>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
      </WebLayout>
    </RoleProvider>
    </SafeAreaProvider>
  );
}