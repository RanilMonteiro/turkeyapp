import { supabase } from './supabase';

export type SavedSignature = {
  id: string;
  name: string;
  image_data: string; // data:image/...;base64,...
  created_at: string;
};

export const MAX_SAVED_SIGNATURES = 5;

export async function listSavedSignatures(): Promise<SavedSignature[]> {
  const { data, error } = await supabase
    .from('saved_signatures')
    .select('id, name, image_data, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SavedSignature[];
}

export async function saveSignature(imageData: string, name?: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('You need to be signed in to save a signature.');

  const existing = await listSavedSignatures();
  if (existing.some((s) => s.image_data === imageData)) return; // already saved
  if (existing.length >= MAX_SAVED_SIGNATURES) {
    throw new Error(
      `You already have ${MAX_SAVED_SIGNATURES} saved signatures. Delete one from the Saved tab to add another.`
    );
  }

  const { error } = await supabase.from('saved_signatures').insert({
    user_id: auth.user.id,
    name: name ?? `Signature ${new Date().toLocaleDateString('en-ZA')}`,
    image_data: imageData,
  });
  if (error) throw new Error(error.message);
}

export async function deleteSavedSignature(id: string): Promise<void> {
  const { error } = await supabase.from('saved_signatures').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
