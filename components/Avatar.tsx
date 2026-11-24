import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { User } from 'lucide-react-native';

const YELLOW = '#fbbf24';

type Props = {
  /** profiles.avatar_url — when empty (or it fails to load) the fallback shows. */
  url?: string | null;
  /** Used for the letter fallback. */
  name?: string | null;
  size?: number;
  /** 'initial' = first letter of the name (default). 'icon' = generic person icon. */
  fallback?: 'initial' | 'icon';
  /** Background behind the letter / icon. */
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * One avatar used everywhere: shows the person's profile picture if they
 * have one, otherwise their first initial (or a person icon).
 */
export default function Avatar({
  url,
  name,
  size = 44,
  fallback = 'initial',
  backgroundColor = `${YELLOW}25`,
  style,
}: Props) {
  const [failed, setFailed] = useState(false);

  // A new picture (new URL) deserves a fresh attempt.
  useEffect(() => { setFailed(false); }, [url]);

  const box: ViewStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };

  const initial = (name ?? '').trim().charAt(0).toUpperCase();
  const showImage = !!url && !failed;

  return (
    <View style={[box, style]}>
      {showImage ? (
        <Image
          source={{ uri: url! }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          cachePolicy="disk"
          onError={() => setFailed(true)}
          accessibilityLabel={name ? `${name}'s profile picture` : 'Profile picture'}
        />
      ) : fallback === 'initial' && initial ? (
        <Text style={{ color: YELLOW, fontWeight: '700', fontSize: Math.round(size * 0.42) }}>
          {initial}
        </Text>
      ) : (
        <User color={YELLOW} size={Math.round(size * 0.48)} />
      )}
    </View>
  );
}
