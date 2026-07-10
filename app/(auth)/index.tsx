import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Dimensions, Image
} from 'react-native';
import { useRouter } from 'expo-router';

const { height } = Dimensions.get('window');

const colors = {
  yellow: '#fbbf24',
  white: '#ffffff',
  black: '#000000',
  gray: {
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  }
};

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.circleTopRight} />
      <View style={styles.circleBottomLeft} />
      <View style={styles.circleMiddle} />

      {/* Top section - Logo + Brand */}
      <View style={styles.top}>
        <View style={styles.logoContainer}>
          <View style={styles.logoOuter}>
            <Image
              source={require('../../assets/images/TUENKEYAPPI.jpeg')}
              style={styles.logoImage}
              resizeMode="cover"
            />
          </View>
        </View>

        <Text style={styles.appName}>TURNKEY APP</Text>
        <Text style={styles.appTagline}>Break testing, simplified</Text>
      </View>

      {/* Middle - Decorative badges */}
      <View style={styles.middle}>
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>⛏ Documents</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>📋 Callouts</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>✅ Approvals</Text>
          </View>
        </View>
      </View>

      {/* Bottom - Buttons */}
      <View style={styles.bottom}>
        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => router.push('/(auth)/login' as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.loginText}>Sign In</Text>
        </TouchableOpacity>

        

        <Text style={styles.disclaimer}>
          New accounts are created by Admin.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
  },
  circleTopRight: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: colors.gray[900],
    opacity: 0.8,
  },
  circleBottomLeft: {
    position: 'absolute',
    bottom: -80,
    left: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.gray[900],
    opacity: 0.8,
  },
  circleMiddle: {
    position: 'absolute',
    top: height * 0.35,
    left: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.gray[800],
    opacity: 0.4,
  },
  top: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  logoContainer: {
    marginBottom: 24,
  },
  logoOuter: {
    width: 110,
    height: 110,
    borderRadius: 32,
    backgroundColor: colors.gray[900],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.yellow,
    overflow: 'hidden',
  },
  logoImage: {
    width: 110,
    height: 110,
    borderRadius: 32,
  },
  appName: {
    color: colors.yellow,
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: 4,
    marginBottom: 8,
  },
  appTagline: {
    color: colors.gray[500],
    fontSize: 16,
    letterSpacing: 0.4,
  },
  middle: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  badge: {
    backgroundColor: colors.gray[900],
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.gray[700],
  },
  badgeText: {
    color: colors.gray[400],
    fontSize: 13,
    fontWeight: '500',
  },
  bottom: {
    paddingHorizontal: 28,
    paddingBottom: 48,
    gap: 14,
  },
  loginButton: {
    backgroundColor: colors.yellow,
    borderRadius: 14,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginText: {
    color: colors.black,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  registerButton: {
    backgroundColor: 'transparent',
    borderRadius: 14,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.gray[700],
  },
  registerText: {
    color: colors.gray[400],
    fontSize: 17,
    fontWeight: '600',
  },
  disclaimer: {
    color: colors.gray[600],
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
});