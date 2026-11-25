import React, { useState } from 'react';

type Props = {
  children: React.ReactNode;
  onFile: (asset: { uri: string; name: string; mimeType?: string; size?: number }) => void;
};

// Web only: drop a file onto the upload box instead of clicking it.
export default function FileDropZone({ children, onFile }: Props) {
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(e: any) => { e.preventDefault(); setOver(true); }}
      onDragEnter={(e: any) => { e.preventDefault(); setOver(true); }}
      onDragLeave={(e: any) => { e.preventDefault(); setOver(false); }}
      onDrop={(e: any) => {
        e.preventDefault();
        setOver(false);
        const file: File | undefined = e.dataTransfer?.files?.[0];
        if (!file) return;
        onFile({
          uri: URL.createObjectURL(file),
          name: file.name,
          mimeType: file.type || undefined,
          size: file.size,
        });
      }}
      style={{
        borderRadius: 14,
        outline: over ? '2px dashed #fbbf24' : '2px dashed transparent',
        outlineOffset: 2,
        background: over ? 'rgba(251,191,36,0.10)' : 'transparent',
        transition: 'all 120ms ease',
      }}
    >
      {children}
    </div>
  );
}
