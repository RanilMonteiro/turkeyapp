import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

const BUCKET = 'avatars';

export type AvatarSource = 'library' | 'camera';

async function toBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    return new Uint8Array(await (await res.blob()).arrayBuffer());
  }
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

/** Pull "<user-id>/<file>" out of a public avatar URL so the old file can be removed. */
function pathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
}

/**
 * Let the user pick (or take) a photo, upload it to the "avatars" bucket
 * and save its URL on their profile.
 *
 * Returns:
 *   { url }       -> success
 *   { cancelled } -> user backed out (not an error)
 *   { error }     -> something to show the user
 */
export async function chooseAndUploadAvatar(
  userId: string,
  source: AvatarSource,
  previousUrl?: string | null,
): Promise<{ url: string } | { cancelled: true } | { error: string }> {
  try {
    if (Platform.OS !== 'web') {
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        return {
          error:
            source === 'camera'
              ? 'Please allow camera access in your phone settings to take a photo.'
              : 'Please allow photo library access in your phone settings to choose a photo.',
        };
      }
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,   // square crop on phones
      aspect: [1, 1],
      quality: 0.5,          // keeps profile pictures small
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

    if (result.canceled || !result.assets?.[0]) return { cancelled: true };

    const asset = result.assets[0];
    const mime = (asset.mimeType ?? 'image/jpeg').toLowerCase();
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const contentType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;

    // New file name each time so every device sees the new picture straight
    // away (no stale cached copy of the old one).
    const path = `${userId}/${Date.now()}.${ext}`;
    const bytes = await toBytes(asset.uri);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType, upsert: true });
    if (uploadError) return { error: uploadError.message };

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const url = data.publicUrl;

    const { error: saveError } = await supabase
      .from('profiles')
      .update({ avatar_url: url })
      .eq('id', userId);
    if (saveError) {
      // Don't leave an orphaned file behind.
      await supabase.storage.from(BUCKET).remove([path]);
      return { error: saveError.message };
    }

    // Tidy up the picture this replaces (best effort — never blocks success).
    const old = pathFromUrl(previousUrl);
    if (old && old !== path) {
      supabase.storage.from(BUCKET).remove([old]).catch(() => {});
    }

    return { url };
  } catch (e: any) {
    return { error: e?.message ?? 'Something went wrong while saving your picture.' };
  }
}

/** Remove the user's profile picture (they go back to showing their letter). */
export async function removeAvatar(
  userId: string,
  currentUrl?: string | null,
): Promise<{ error?: string }> {
  const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId);
  if (error) return { error: error.message };
  const old = pathFromUrl(currentUrl);
  if (old) supabase.storage.from(BUCKET).remove([old]).catch(() => {});
  return {};
}
