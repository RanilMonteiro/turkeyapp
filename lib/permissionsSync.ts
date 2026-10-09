import { supabase } from './supabase';

/**
 * Make a user's rows in user_permissions match `keys` exactly: add the
 * switched-on ones, remove everything else. Used by Create User and Edit
 * User so that turning a switch OFF really revokes it, instead of
 * depending on the create-user edge function to remove old rows.
 *
 * Needs the "superuser_manage_permissions" policy from permissions_v2.sql.
 * Returns an error message, or null on success.
 */
export async function syncUserPermissions(userId: string, keys: string[]): Promise<string | null> {
  const { data: me } = await supabase.auth.getUser();

  if (keys.length > 0) {
    const { error } = await supabase.from('user_permissions').upsert(
      keys.map(permission => ({
        user_id: userId,
        permission,
        granted: true,
        granted_by: me.user?.id ?? null,
      })),
      { onConflict: 'user_id,permission' }
    );
    if (error) {
      console.error('Permission upsert failed', error);
      return 'Could not save the permission switches. Run permissions_v2.sql in Supabase, then try again.';
    }
  }

  // Remove everything no longer switched on (including retired keys).
  let del = supabase.from('user_permissions').delete().eq('user_id', userId);
  if (keys.length > 0) del = del.not('permission', 'in', `(${keys.join(',')})`);
  const { error } = await del;
  if (error) {
    console.error('Permission delete failed', error);
    return 'Could not remove switched-off permissions. Run permissions_v2.sql in Supabase, then try again.';
  }
  return null;
}
