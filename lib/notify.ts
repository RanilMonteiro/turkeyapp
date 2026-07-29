import { Alert, Platform } from 'react-native';

/**
 * Drop-in replacement for Alert.alert that also works on web.
 *
 * React Native's Alert.alert renders a real native dialog on iOS/Android,
 * but is a silent no-op on react-native-web — so any Alert.alert call
 * in a web build (Vercel deploy) just does nothing visible. This wraps
 * both cases with one call.
 *
 * Usage is the same as Alert.alert:
 *   notify('Missing field', 'Name is required');
 *   notify('Submitted', 'Your request is pending approval', () => router.back());
 */
export function notify(title: string, message?: string, onOk?: () => void) {
  if (Platform.OS === 'web') {
    // window.alert blocks until dismissed, so call onOk right after.
    window.alert(message ? `${title}\n\n${message}` : title);
    onOk?.();
    return;
  }

  Alert.alert(
    title,
    message,
    onOk ? [{ text: 'OK', onPress: onOk }] : undefined
  );
}