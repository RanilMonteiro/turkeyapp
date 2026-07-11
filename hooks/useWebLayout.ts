import { Platform, useWindowDimensions } from 'react-native';

export function useIsWeb() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= 768;
}