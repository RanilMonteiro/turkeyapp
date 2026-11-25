import React from 'react';
import { View } from 'react-native';

type Props = {
  children: React.ReactNode;
  onFile: (asset: { uri: string; name: string; mimeType?: string; size?: number }) => void;
};

// Phones have no drag and drop - the web version (FileDropZone.web.tsx)
// adds it. Here we just render the children unchanged.
export default function FileDropZone({ children }: Props) {
  return <View>{children}</View>;
}
