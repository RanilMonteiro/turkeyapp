import { Platform, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { notify } from './notify';

function safeFileName(name?: string | null, fileType?: string | null, url?: string): string {
  const base = (name ?? '').trim().replace(/[\\/:*?"<>|]+/g, '_') || 'document';
  let ext = (fileType ?? '').replace('.', '').trim();
  if (!ext && url) {
    const m = url.split('?')[0].match(/\.([a-zA-Z0-9]{2,5})$/);
    ext = m ? m[1] : '';
  }
  if (ext && base.toLowerCase().endsWith('.' + ext.toLowerCase())) return base;
  return ext ? `${base}.${ext}` : base;
}

// Supabase Storage sends the file as a download (instead of showing it)
// when the public URL has ?download=<filename>.
function downloadUrl(url: string, filename: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(filename)}`;
}

function clickAnchor(href: string, opts: { newTab?: boolean; download?: string }) {
  const a = document.createElement('a');
  a.href = href;
  if (opts.newTab) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  if (opts.download) a.download = opts.download;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Open the document so it can be looked at. */
export async function viewDocument(url?: string | null) {
  if (!url) {
    notify('No file', 'This document has no file attached.');
    return;
  }
  try {
    if (Platform.OS === 'web') {
      clickAnchor(url, { newTab: true });
      return;
    }
    await Linking.openURL(url);
  } catch (e: any) {
    notify("Couldn't open document", e?.message ?? 'Please try Download instead.');
  }
}

/** Save the document to the device. */
export async function downloadDocument(
  url?: string | null,
  name?: string | null,
  fileType?: string | null
) {
  if (!url) {
    notify('No file', 'This document has no file attached.');
    return;
  }
  const filename = safeFileName(name, fileType, url);
  const dlUrl = downloadUrl(url, filename);
  try {
    if (Platform.OS === 'web') {
      clickAnchor(dlUrl, { download: filename });
      return;
    }
    const target = `${FileSystem.cacheDirectory}${Date.now()}_${filename.replace(/\s+/g, '_')}`;
    const res = await FileSystem.downloadAsync(url, target);
    if (res.status !== 200) throw new Error(`Download failed (${res.status})`);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(res.uri, { dialogTitle: filename });
    } else {
      await Linking.openURL(dlUrl);
    }
  } catch (e: any) {
    try {
      await Linking.openURL(dlUrl);
    } catch {
      notify("Couldn't download document", e?.message ?? 'Please try again.');
    }
  }
}
