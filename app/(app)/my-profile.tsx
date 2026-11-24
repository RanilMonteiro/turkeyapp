import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, useColorScheme,
  ActivityIndicator, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Camera, Image as ImageIcon, Trash2 } from 'lucide-react-native';
import Avatar from '../../components/Avatar';
import { useAccess } from '../../context/AccessContext';
import { chooseAndUploadAvatar, removeAvatar, AvatarSource } from '../../lib/avatar';
import { notify, confirm } from '../../lib/notify';

const colors = {
  yellow: '#fbbf24',
  white: '#ffffff',
  black: '#000000',
  gray: { 50: '#f8fafc', 200: '#e2e8f0', 400: '#94a3b8', 500: '#64748b', 700: '#334155', 800: '#1e293b', 900: '#0f172a' },
};

export default function MyProfile() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const { userId, fullName, role, avatarUrl, homeRoute, refresh } = useAccess();
  const [busy, setBusy] = useState(false);

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    text: isDark ? colors.white : '#1e293b',
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    button: isDark ? colors.gray[800] : colors.gray[50],
  };

  const roleLabel = !role ? '' : role === 'hr' ? 'HR' : role.charAt(0).toUpperCase() + role.slice(1);

  function goBack() {
    if (router.canGoBack()) router.back();
    else if (homeRoute) router.replace(homeRoute as any);
  }

  async function pick(source: AvatarSource) {
    if (!userId || busy) return;
    setBusy(true);
    const result = await chooseAndUploadAvatar(userId, source, avatarUrl);
    if ('error' in result) {
      notify('Could not save picture', result.error);
    } else if ('url' in result) {
      await refresh(); // updates the sidebar / dashboard right away
    }
    setBusy(false);
  }

  function handleRemove() {
    if (!userId || busy) return;
    confirm(
      'Remove picture',
      'Your profile picture will be removed and your initial will show instead.',
      async () => {
        setBusy(true);
        const { error } = await removeAvatar(userId, avatarUrl);
        if (error) notify('Error', error);
        else await refresh();
        setBusy(false);
      },
      'Remove',
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={goBack}>
          <ArrowLeft color={colors.yellow} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>My Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => pick('library')}
            disabled={busy}
          >
            <Avatar url={avatarUrl} name={fullName} size={120} />
            <View style={styles.cameraBadge}>
              {busy
                ? <ActivityIndicator size="small" color={colors.black} />
                : <Camera size={16} color={colors.black} />}
            </View>
          </TouchableOpacity>

          <Text style={[styles.name, { color: theme.text }]}>{fullName}</Text>
          {!!roleLabel && (
            <View style={styles.rolePill}>
              <Text style={styles.roleText}>{roleLabel}</Text>
            </View>
          )}
          <Text style={[styles.hint, { color: theme.subtext }]}>
            Your profile picture is shown to HR and your team wherever your name appears.
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.subtext }]}>PROFILE PICTURE</Text>

        <TouchableOpacity
          style={[styles.action, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={() => pick('library')}
          disabled={busy}
        >
          <ImageIcon color={colors.yellow} size={20} />
          <Text style={[styles.actionText, { color: theme.text }]}>
            {avatarUrl ? 'Choose a new photo' : 'Choose a photo'}
          </Text>
        </TouchableOpacity>

        {Platform.OS !== 'web' && (
          <TouchableOpacity
            style={[styles.action, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => pick('camera')}
            disabled={busy}
          >
            <Camera color={colors.yellow} size={20} />
            <Text style={[styles.actionText, { color: theme.text }]}>Take a photo</Text>
          </TouchableOpacity>
        )}

        {!!avatarUrl && (
          <TouchableOpacity
            style={[styles.action, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={handleRemove}
            disabled={busy}
          >
            <Trash2 color="#ef4444" size={20} />
            <Text style={[styles.actionText, { color: '#ef4444' }]}>Remove picture</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  content: { padding: 16, gap: 10, maxWidth: 560, width: '100%', alignSelf: 'center' },
  card: { alignItems: 'center', padding: 24, borderRadius: 16, borderWidth: 1, marginBottom: 8 },
  cameraBadge: {
    position: 'absolute', right: 0, bottom: 0, width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center',
  },
  name: { fontSize: 22, fontWeight: '700', marginTop: 14 },
  rolePill: {
    marginTop: 8, backgroundColor: `${colors.yellow}25`,
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20,
  },
  roleText: { color: colors.yellow, fontSize: 12, fontWeight: '700' },
  hint: { fontSize: 13, textAlign: 'center', marginTop: 14 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 8, marginLeft: 4 },
  action: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 14, borderWidth: 1,
  },
  actionText: { fontSize: 15, fontWeight: '600' },
});
