// ─────────────────────────────────────────────────────────────────────
// DEPRECATED — kept only so the two older screens that still import it
// (dashboard/index.tsx, profile/documents.tsx) keep working.
//
// This used to hold a hard-coded permission map and always reported the
// user as a 'technician' (nothing ever called setRole). It now just reads
// the real role from AccessContext. New code should use `useAccess()`
// from '../context/AccessContext' directly.
// ─────────────────────────────────────────────────────────────────────
import { AccessProvider, useAccess } from '../context/AccessContext';
import type { PermissionKey } from '../constants/permissions';

export const RoleProvider = AccessProvider;

export function useRole() {
  const access = useAccess();
  const role = access.role ?? 'technician';
  return {
    role,
    can: (permission: string) => access.can(permission as PermissionKey),
    isTechnician: role === 'technician',
    isAdmin: role === 'admin' || role === 'superuser',
    isSuperuser: role === 'superuser',
  };
}
