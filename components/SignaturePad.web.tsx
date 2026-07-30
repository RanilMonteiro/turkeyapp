import React, { forwardRef, useImperativeHandle, useRef, useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';

export type SignaturePadHandle = {
  clearSignature: () => void;
  readSignature: () => void;
};

type Props = {
  onOK: (signature: string) => void;
  onEmpty: () => void;
  style?: ViewStyle;
};

// Metro/Expo automatically picks THIS file over SignaturePad.tsx when
// building for web (the .web.tsx extension takes priority). This exists
// because react-native-signature-canvas relies on react-native-webview,
// which has no web implementation at all — "React Native WebView does
// not support this platform" is that library telling you exactly that.
// A plain <canvas> with pointer events sidesteps the problem entirely.
const SignaturePad = forwardRef<SignaturePadHandle, Props>(({ onOK, onEmpty, style }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<View>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function resize() {
      const parent = canvas!.parentElement;
      if (!parent) return;
      // Preserve existing drawing across resize where possible.
      const prev = canvas!.toDataURL();
      canvas!.width = parent.clientWidth;
      canvas!.height = parent.clientHeight;
      if (hasDrawn.current) {
        const img = new Image();
        img.onload = () => canvas!.getContext('2d')?.drawImage(img, 0, 0);
        img.src = prev;
      }
    }

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  function getPos(e: any) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function start(e: any) {
    e.preventDefault?.();
    drawing.current = true;
    lastPoint.current = getPos(e);
  }

  function move(e: any) {
    if (!drawing.current) return;
    e.preventDefault?.();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !lastPoint.current) return;
    const point = getPos(e);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint.current = point;
    hasDrawn.current = true;
  }

  function end() {
    drawing.current = false;
    lastPoint.current = null;
  }

  useImperativeHandle(ref, () => ({
    clearSignature: () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasDrawn.current = false;
    },
    readSignature: () => {
      if (!hasDrawn.current) {
        onEmpty();
        return;
      }
      const dataUrl = canvasRef.current?.toDataURL('image/png');
      if (dataUrl) onOK(dataUrl);
    },
  }));

  return (
    <View ref={containerRef} style={[styles.container, style]}>
      {/* @ts-ignore - raw DOM canvas element, valid on react-native-web */}
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          touchAction: 'none',
          background: '#ffffff',
          borderRadius: 12,
          display: 'block',
        }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 300 },
});

export default SignaturePad;