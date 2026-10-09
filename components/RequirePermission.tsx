import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { useAccess } from '../context/AccessContext';
import type { PermissionKey } from '../constants/permissions';

// Wrap a screen so it only opens when the person's permission switch is
// ON. Hiding the sidebar tab / dashboard card isn't enough on its own —
// someone could still open the page from a saved link or a stale tab.
//
//   export default function SitesScreen() {
//     return (
//       <RequirePermission permission="view_sites" name="Sites">
//         <SitesManager />
//       </RequirePermission>
//     );
//   }
//
// Note: this is a UI guard. The database rules (RLS) are what truly
// protect the data.

type Props = {
  permission: PermissionKey;
  /** Friendly name of the screen, used in the message. */
  name: string;
  children: React.ReactNode;
};

export default function RequirePermission({ permission, name, children }: Props) {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const { loading, role, can, homeRoute } = useAccess();

  const bg = isDark ? '#000000' : '#f8fafc';
  const text = isDark ? '#ffffff' : '#1e293b';
  const sub = isDark ? '#94a3b8' : '#64748b';

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <ActivityIndicator color="#fbbf24" size="large" />
      </View>
    );
  }

  if (role && can(permission)) return <>{children}</>;

  return (
    <View style={[styles.center, { backgroundColor: bg }]}>
      <View style={styles.iconWrap}>
        <Lock color="#fbbf24" size={32} />
      </View>
      <Text style={[styles.title, { color: text }]}>No access to {name}</Text>
      <Text style={[styles.body, { color: sub }]}>
        This has been switched off for your account. Ask a superuser if you need it turned on.
      </Text>
      {homeRoute && (
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace(homeRoute as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Back to dashboard</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#fbbf2420',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 360, marginBottom: 24 },
  button: { backgroundColor: '#fbbf24', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  buttonText: { color: '#000000', fontWeight: '700', fontSize: 15 },
});
