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

/**
 * Drop-in replacement for a destructive Alert.alert confirm dialog
 * (Cancel / Delete-style buttons).
 *
 * Alert.alert with a multi-button array renders NOTHING on
 * react-native-web — no dialog appears at all, which means the
 * onConfirm callback (often containing the actual delete call)
 * never runs. That's why "delete" buttons can look like they do
 * nothing on web: the confirmation step itself silently fails to
 * even display.
 *
 * Usage:
 *   confirm('Delete Form', `Delete "${form.name}"?`, () => doDelete());
 */
export function confirm(
  title: string,
  message: string,
  onConfirm: () => void,
  confirmLabel: string = 'Delete'
) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}