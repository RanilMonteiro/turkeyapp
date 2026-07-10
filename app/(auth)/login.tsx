import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  StatusBar, Alert, ActivityIndicator, useColorScheme, Image
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';

const getColors = (isDark: boolean) => ({
  background: isDark ? '#000000' : '#f8fafc',
  card: isDark ? '#0f172a' : '#ffffff',
  border: isDark ? '#334155' : '#e2e8f0',
  input: isDark ? '#1e293b' : '#f1f5f9',
  text: isDark ? '#ffffff' : '#1e293b',
  subtext: isDark ? '#64748b' : '#64748b',
  label: isDark ? '#94a3b8' : '#475569',
  yellow: '#fbbf24',
  black: '#000000',
});

export default function LoginScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const colors = getColors(isDark);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin() {
    if (!username || !password) {
      Alert.alert('Missing fields', 'Please enter your username and password.');
      return;
    }
    setLoading(true);

    try {
      const email = `${username}@turnkeyinstruments.co.za`;
      console.log('Logging in with:', email);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        Alert.alert('Login failed', error.message);
        setLoading(false);
        return;
      }

      console.log('Login success, fetching profile...');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      console.log('Profile:', JSON.stringify(profile));
      console.log('Profile error:', JSON.stringify(profileError));

      console.log("PROFILE RESULT:", profile);
console.log("PROFILE ERROR:", profileError);

      setLoading(false);

 if (profile?.role === 'superuser') {
  router.replace('/(app)/superuser' as any);
} else if (profile?.role === 'admin') {
  router.replace('/(app)/admin' as any);
} else if (profile?.role === 'hr') {
  router.replace('/(app)/hr' as any);
} else {
  router.replace('/(app)/technician' as any);
}

    } catch (e) {
      console.log('Unexpected error:', e);
      Alert.alert('Error', 'Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={styles.inner}>
        <View style={styles.brandRow}>
          <Image
            source={require('../../assets/images/TUENKEYAPPI.jpeg')}
            style={styles.brandLogo}
            resizeMode="cover"
          />
          <Text style={[styles.brandName, { color: colors.yellow }]}>TURNKEY</Text>
        </View>

        <Text style={[styles.heading, { color: colors.text }]}>Welcome back</Text>
        <Text style={[styles.subheading, { color: colors.subtext }]}>Sign in to your account</Text>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.label }]}>USERNAME</Text>
            <View style={[styles.inputWrapper, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Enter your username"
                placeholderTextColor={colors.subtext}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.label }]}>PASSWORD</Text>
            <View style={[styles.inputWrapper, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Enter your password"
                placeholderTextColor={colors.subtext}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Text style={[styles.toggleText, { color: colors.yellow }]}>
                  {showPassword ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={colors.black} />
              : <Text style={styles.buttonText}>Sign In</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 32 },
  brandLogo: { width: 40, height: 40, borderRadius: 10, marginRight: 12 },
  brandName: { fontSize: 22, fontWeight: '800', letterSpacing: 3 },
  heading: { fontSize: 30, fontWeight: '700', marginBottom: 6 },
  subheading: { fontSize: 15, marginBottom: 32 },
  card: { borderRadius: 20, padding: 24, borderWidth: 1 },
  fieldGroup: { marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 8, letterSpacing: 0.8 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, height: 52,
  },
  input: { flex: 1, fontSize: 15 },
  toggleText: { fontSize: 13, fontWeight: '600' },
  button: {
    backgroundColor: '#fbbf24', borderRadius: 12,
    height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#000000', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
});