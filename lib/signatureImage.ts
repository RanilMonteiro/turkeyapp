import { Platform } from 'react-native';
import { supabase } from './supabase';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_WIDTH = 900;

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};
const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function parseDataUrl(dataUrl: string): { mime: string; b64: string } | null {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]*)$/.exec(dataUrl);
  return m ? { mime: m[1], b64: m[2] } : null;
}

/**
 * Uploads a signature (any image data URL) to the `signatures` bucket and
 * returns its public URL, or null on failure. `baseName` has no extension -
 * it's added from the image type.
 */
export async function uploadSignatureDataUrl(dataUrl: string, baseName: string): Promise<string | null> {
  try {
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) return null;
    const ext = MIME_TO_EXT[parsed.mime] ?? 'png';
    const bytes = Uint8Array.from(atob(parsed.b64), (c) => c.charCodeAt(0));
    const fileName = `${baseName}.${ext}`;

    const { error } = await supabase.storage
      .from('signatures')
      .upload(fileName, bytes, { contentType: parsed.mime });
    if (error) return null;

    const { data } = supabase.storage.from('signatures').getPublicUrl(fileName);
    return data.publicUrl;
  } catch {
    return null;
  }
}

type PickedFile = { uri: string; name: string; mimeType?: string; size?: number };

function guessMime(file: PickedFile): string | null {
  const fromType = file.mimeType === 'image/jpg' ? 'image/jpeg' : file.mimeType;
  if (fromType && MIME_TO_EXT[fromType]) return fromType;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_MIME[ext] ?? null;
}

/**
 * Turns a picked / dropped image file into a data URL we can preview, save
 * and upload. Throws an Error with a friendly message if the file isn't usable.
 */
export async function fileToSignatureDataUrl(file: PickedFile): Promise<string> {
  const mime = guessMime(file);
  if (!mime) throw new Error('Please choose a PNG or JPG image of your signature.');
  if (file.size && file.size > MAX_UPLOAD_BYTES) {
    throw new Error('That image is too big. Please use one under 5 MB.');
  }

  if (Platform.OS === 'web') {
    const g: any = globalThis;
    const blob = await (await fetch(file.uri)).blob();
    const objectUrl = g.URL.createObjectURL(blob);
    try {
      const img: any = await new Promise((resolve, reject) => {
        const el = new g.Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Could not read that image.'));
        el.src = objectUrl;
      });
      const scale = Math.min(1, MAX_WIDTH / img.width);
      const canvas = g.document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    } finally {
      g.URL.revokeObjectURL(objectUrl);
    }
  }

  const FileSystem = require('expo-file-system/legacy');
  const b64 = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' });
  if (b64.length * 0.75 > MAX_UPLOAD_BYTES) throw new Error('That image is too big. Please use one under 5 MB.');
  return `data:${mime};base64,${b64}`;
}
