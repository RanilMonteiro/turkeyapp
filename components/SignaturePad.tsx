import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import SignatureCanvas from 'react-native-signature-canvas';

export type SignaturePadHandle = {
  clearSignature: () => void;
  readSignature: () => void;
};

type Props = {
  onOK: (signature: string) => void;
  onEmpty: () => void;
  style?: ViewStyle;
};

// We render our OWN Clear/Save buttons in React Native (see submit-form),
// so the library's internal HTML footer is hidden entirely. This avoids
// the common issue where the embedded WebView reports 0 height inside a
// Modal and the internal Save button ends up invisible or unreachable.
const hideFooterStyle = `
  .m-signature-pad--footer { display: none; }
  .m-signature-pad--body { border: none; }
  .m-signature-pad { box-shadow: none; border: none; width: 100%; height: 100%; }
  body, html { margin: 0; height: 100%; }
`;

const SignaturePad = forwardRef<SignaturePadHandle, Props>(({ onOK, onEmpty, style }, ref) => {
  const innerRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    clearSignature: () => innerRef.current?.clearSignature(),
    readSignature: () => innerRef.current?.readSignature(),
  }));

  return (
    <View style={[styles.container, style]}>
      <SignatureCanvas
        ref={innerRef}
        onOK={onOK}
        onEmpty={onEmpty}
        webStyle={hideFooterStyle}
        autoClear={false}
        style={styles.canvas}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 300 },
  canvas: { flex: 1 },
});

export default SignaturePad;