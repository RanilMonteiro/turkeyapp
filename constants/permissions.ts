// ─────────────────────────────────────────────────────────────────────
// PERMISSIONS — the one place every permission is defined.
//
// Used by: Create User, Edit User, the web sidebar, all four dashboards,
// and any screen that needs to ask "can this person do X?".
//
// How a permission is decided (hasPermission below):
//   1. superuser      -> always yes, for everything.
//   2. alwaysOnFor    -> that role has it automatically, no row needed.
//   3. grantableTo    -> that role has it ONLY if a granted row exists
//                        in user_permissions for them.
//   4. anything else  -> no.
//   Plus: a permission with `requires` is only effective while the
//   permission it depends on is ALSO on (e.g. "Edit sites" does nothing
//   once "Sites" itself is switched off).
//
// These rules deliberately mirror the SQL helper functions so the UI
// never shows a button the database would reject (or hides one it
// would allow):
//   can_manage_sites()                -> superuser, or admin/hr with the grant
//   can_edit_operational_calendar()   -> superuser + hr, or admin with the grant
//   get_eligible_approvers()          -> superuser + hr, or admin with can_approve
// If you change one of those SQL functions, change it here too.
//
// To add a new permission: add ONE entry below. It will automatically
// appear in Create/Edit User for the roles in `grantableTo`.
// ─────────────────────────────────────────────────────────────────────

export type Role = 'superuser' | 'hr' | 'admin' | 'technician';

export type PermissionKey =
  | 'view_callouts'
  | 'view_callouts_tech'
  | 'view_calendar'
  | 'view_operational_calendar'
  | 'can_edit_operational_calendar'
  | 'manage_team'
  | 'can_approve'
  | 'view_sites'
  | 'can_manage_sites';

export type PermissionGroup = 'callouts' | 'schedule' | 'people' | 'sites';

export type PermissionDef = {
  key: PermissionKey;
  label: string;
  description: string;
  group: PermissionGroup;
  /** Roles that get a toggle for this in Create/Edit User. */
  grantableTo: Role[];
  /** Roles that always have it without needing a grant. */
  alwaysOnFor: Role[];
  /** Roles that start with this switched ON when a new user is created. */
  defaultOnFor?: Role[];
  /** Only effective while this other permission is also on. */
  requires?: PermissionKey;
};

export const PERMISSION_GROUP_LABELS: Record<PermissionGroup, string> = {
  callouts: 'Callouts',
  schedule: 'Calendars',
  people: 'People & approvals',
  sites: 'Sites',
};

export const PERMISSION_GROUP_ORDER: PermissionGroup[] = [
  'callouts',
  'schedule',
  'people',
  'sites',
];

export const PERMISSIONS: PermissionDef[] = [
  {
    key: 'view_callouts',
    label: 'Callouts (Admin)',
    description: 'Manage and create callouts.',
    group: 'callouts',
    grantableTo: ['admin'],
    alwaysOnFor: [],
  },
  {
    // One switch for "the technician-style callouts screen": it is what a
    // technician sees as "My Callouts" and what an admin sees as
    // "Callouts (Technician)".
    key: 'view_callouts_tech',
    label: 'Callouts (Technician view)',
    description: 'See, accept and complete jobs like a technician.',
    group: 'callouts',
    grantableTo: ['admin', 'technician'],
    alwaysOnFor: [],
    defaultOnFor: ['technician'],
  },
  {
    key: 'view_calendar',
    label: 'Callout Calendar',
    description: 'See the callout schedule calendar.',
    group: 'schedule',
    grantableTo: ['admin'],
    alwaysOnFor: [],
  },
  {
    key: 'view_operational_calendar',
    label: 'Operational Calendar',
    description: 'Open the technician job calendar (technicians only see their own).',
    group: 'schedule',
    grantableTo: ['admin', 'hr', 'technician'],
    alwaysOnFor: [],
    defaultOnFor: ['admin', 'hr', 'technician'],
  },
  {
    key: 'can_edit_operational_calendar',
    label: 'Edit Operational Calendar',
    description:
      'Add, change and colour entries on the job calendar. Without this they can only view it.',
    group: 'schedule',
    grantableTo: ['admin'],
    alwaysOnFor: ['hr'],
    requires: 'view_operational_calendar',
  },
  {
    key: 'manage_team',
    label: 'Technicians list',
    description: 'View the field team (technicians).',
    group: 'people',
    grantableTo: ['admin'],
    alwaysOnFor: [],
  },
  {
    key: 'can_approve',
    label: 'Eligible approver',
    description: 'Can be chosen as an approver in employee approval chains.',
    group: 'people',
    grantableTo: ['admin'],
    alwaysOnFor: ['hr'],
  },
  {
    key: 'view_sites',
    label: 'Sites',
    description: 'Open sites: info, contacts, notes and documents.',
    group: 'sites',
    grantableTo: ['admin', 'hr', 'technician'],
    alwaysOnFor: [],
    defaultOnFor: ['admin', 'hr', 'technician'],
  },
  {
    key: 'can_manage_sites',
    label: 'Edit sites',
    description:
      'Create sites and edit site info, contacts, documents and notes. Without this they can only view and add notes/documents.',
    group: 'sites',
    grantableTo: ['admin', 'hr'],
    alwaysOnFor: [],
    requires: 'view_sites',
  },
];

const BY_KEY: Record<string, PermissionDef> = Object.fromEntries(
  PERMISSIONS.map(p => [p.key, p])
);

/** Does this person effectively have this permission? */
export function hasPermission(
  role: Role | null | undefined,
  granted: readonly string[],
  key: PermissionKey
): boolean {
  if (!role) return false;
  if (role === 'superuser') return true;
  const def = BY_KEY[key];
  if (!def) return false;
  // A dependent permission (e.g. Edit sites) is dead while its parent
  // (Sites) is switched off.
  if (def.requires && !hasPermission(role, granted, def.requires)) return false;
  if (def.alwaysOnFor.includes(role)) return true;
  return def.grantableTo.includes(role) && granted.includes(key);
}

/** Permissions that get a toggle for this role (Create/Edit User). */
export function permissionsGrantableTo(role: Role): PermissionDef[] {
  return PERMISSIONS.filter(p => p.grantableTo.includes(role));
}

/** Permissions this role has automatically (shown as an info line). */
export function permissionsAlwaysOn(role: Role): PermissionDef[] {
  return PERMISSIONS.filter(p => p.alwaysOnFor.includes(role));
}

/**
 * Strip a list of keys down to the ones that are real AND grantable to
 * this role, and drop any dependent permission whose parent is off. Used
 * right before saving so old/retired keys (e.g. the removed
 * `view_reports`) and keys that don't apply to the role never get
 * written back.
 */
export function sanitizePermissions(role: Role, keys: readonly string[]): string[] {
  const grantable = permissionsGrantableTo(role);
  const allowed = new Set(grantable.map(p => p.key as string));
  const picked = new Set(keys.filter(k => allowed.has(k)));
  for (const p of grantable) {
    if (p.requires && !picked.has(p.requires)) picked.delete(p.key);
  }
  return Array.from(picked);
}

/** The switches that start ON for a brand-new user of this role. */
export function defaultPermissionsFor(role: Role): string[] {
  return PERMISSIONS
    .filter(p => p.grantableTo.includes(role) && p.defaultOnFor?.includes(role))
    .map(p => p.key);
}

/**
 * Flip one switch. Turning a parent OFF also turns off everything that
 * depends on it, so the screen never shows "Edit sites" on while
 * "Sites" is off.
 */
export function togglePermissionKey(selected: readonly string[], key: string): string[] {
  if (selected.includes(key)) {
    const dependents = PERMISSIONS.filter(p => p.requires === key).map(p => p.key as string);
    return selected.filter(k => k !== key && !dependents.includes(k));
  }
  return [...selected, key];
}
