import type { ComponentType } from 'react';
import {
  LayoutDashboard, Users, UserCog, FileText, ClipboardList, MapPin,
  CheckCircle, Calendar, CalendarDays, CalendarCheck, Wrench, HardHat,
  FolderOpen, Eye, ShieldCheck,
} from 'lucide-react-native';
import { PermissionKey, Role, hasPermission } from './permissions';

// ─────────────────────────────────────────────────────────────────────
// FEATURES — every screen a user can navigate to, defined ONCE.
//
// The web sidebar and all four mobile/web dashboards are built from this
// list, so they can never drift apart again. To add a screen: add one
// entry here (roles + optional permission) and it appears everywhere it
// should. To hide a screen from someone: remove their role or change the
// permission — don't edit the dashboards or the sidebar.
//
// ORDER matters: it is the order shown in the sidebar and dashboards.
// ─────────────────────────────────────────────────────────────────────

type Icon = ComponentType<{ color?: string; size?: number }>;

export type FeatureGroup = 'operations' | 'people' | 'company' | 'me';

export const FEATURE_GROUP_LABELS: Record<FeatureGroup, string> = {
  operations: 'OPERATIONS',
  people: 'PEOPLE & HR',
  company: 'COMPANY',
  me: 'MY WORK',
};

export const FEATURE_GROUP_ORDER: FeatureGroup[] = ['operations', 'people', 'company', 'me'];

type Feature = {
  id: string;
  title: string;
  description: string;
  icon: Icon;
  route: string;
  group: FeatureGroup;
  /** Roles that can ever see this. */
  roles: Role[];
  /** Also required (checked with hasPermission, so superuser/alwaysOn roles pass). */
  permission?: PermissionKey;
  /** Only shown to admins HR has granted document access to. */
  requiresDocGrants?: boolean;
  /** Show as a card on the dashboard. Default true. */
  dashboard?: boolean;
  /** Show in the web sidebar. Default true. */
  sidebar?: boolean;
  /** Different wording for specific roles. */
  titleByRole?: Partial<Record<Role, string>>;
  descriptionByRole?: Partial<Record<Role, string>>;
  /** Extra URL prefixes that should highlight this item (detail/create pages). */
  alsoMatches?: string[];
};

export const FEATURES: Feature[] = [
  // ── OPERATIONS ──────────────────────────────────────────────────────
  {
    id: 'callouts',
    title: 'Callouts',
    description: 'Manage and create callouts',
    icon: FileText,
    route: '/(app)/callouts/(admin)/dashboard',
    group: 'operations',
    roles: ['superuser', 'admin'],
    permission: 'view_callouts',
    alsoMatches: ['/callouts/callout', '/callouts/new-callout'],
  },
  {
    id: 'callouts-tech',
    title: 'Callouts (Technician)',
    description: 'Accept and complete jobs like a technician',
    icon: Wrench,
    route: '/(app)/callouts/(technician)/jobs',
    group: 'operations',
    roles: ['admin'],
    permission: 'view_callouts_tech',
  },
  {
    id: 'my-callouts',
    title: 'My Callouts',
    description: 'View and accept callouts',
    icon: Wrench,
    route: '/(app)/callouts/(technician)/jobs',
    group: 'operations',
    roles: ['technician'],
    permission: 'view_callouts_tech',
  },
  {
    id: 'callout-calendar',
    title: 'Callout Calendar',
    description: 'View callout schedule',
    icon: Calendar,
    route: '/(app)/callouts/(admin)/calendar',
    group: 'operations',
    roles: ['admin'],
    permission: 'view_calendar',
  },
  {
    // Gated by the "Operational Calendar" switch. Whether they can EDIT
    // is a separate switch, decided inside the screen.
    id: 'operational-calendar',
    title: 'Operational Calendar',
    description: 'View technician job schedules',
    icon: CalendarDays,
    route: '/(app)/calender',
    group: 'operations',
    roles: ['superuser', 'hr', 'admin', 'technician'],
    permission: 'view_operational_calendar',
    titleByRole: { technician: 'My Calendar' },
    descriptionByRole: {
      superuser: 'Manage technician job schedules',
      hr: 'Manage technician job schedules',
      technician: 'View your job schedule',
    },
  },
  {
    id: 'technicians',
    title: 'Technicians',
    description: 'View your field team',
    icon: HardHat,
    route: '/(app)/callouts/(admin)/technicians',
    group: 'operations',
    roles: ['admin'],
    permission: 'manage_team',
  },

  // ── PEOPLE & HR ─────────────────────────────────────────────────────
  {
    id: 'manage-users',
    title: 'Manage Users',
    description: 'Create, edit and assign roles',
    icon: UserCog,
    route: '/(app)/superuser/manage-users',
    group: 'people',
    roles: ['superuser'],
    alsoMatches: ['/superuser/create-user', '/superuser/edit-user'],
  },
  {
    id: 'employees',
    title: 'Employees',
    description: 'Manage employee profiles',
    icon: Users,
    route: '/(app)/hr/employees',
    group: 'people',
    roles: ['superuser', 'hr'],
  },
  {
    id: 'requests',
    title: 'Requests',
    description: 'View all form submissions',
    icon: FileText,
    route: '/(app)/hr/requests',
    group: 'people',
    roles: ['superuser', 'hr'],
    alsoMatches: ['/hr/edit-submission'],
  },
  {
    // can_approve is automatic for superuser + hr, a grant for admins.
    id: 'my-approvals',
    title: 'My Approvals',
    description: 'Requests waiting for your approval',
    icon: CheckCircle,
    route: '/(app)/shared/my-approvals',
    group: 'people',
    roles: ['superuser', 'hr', 'admin'],
    permission: 'can_approve',
  },
  {
    id: 'leave-calendar',
    title: 'Leave Calendar',
    description: 'See approved leave',
    icon: CalendarCheck,
    route: '/(app)/shared/leave-calendar',
    group: 'people',
    roles: ['superuser', 'hr', 'admin', 'technician'],
    descriptionByRole: {
      technician: 'See your approved leave',
      admin: 'Leave for the people you can see',
      hr: 'See everyone\u2019s approved leave',
      superuser: 'See everyone\u2019s approved leave',
    },
  },
  {
    id: 'leave-access',
    title: 'Leave Access',
    description: 'Choose which admins can see whose leave',
    icon: ShieldCheck,
    route: '/(app)/hr/leave-access',
    group: 'people',
    roles: ['superuser', 'hr'],
  },

  // ── COMPANY ─────────────────────────────────────────────────────────
  {
    // Gated by the "Sites" switch. Whether they can EDIT is a separate
    // switch (can_manage_sites), decided inside the screen.
    id: 'sites',
    title: 'Sites',
    description: 'Site contacts, info, notes and documents',
    icon: MapPin,
    route: '/(app)/hr/sites',
    group: 'company',
    roles: ['superuser', 'hr', 'admin', 'technician'],
    permission: 'view_sites',
    descriptionByRole: {
      superuser: 'Manage company sites',
      hr: 'Manage company sites',
      technician: 'Site info, notes and documents',
    },
  },

  // ── MY WORK ─────────────────────────────────────────────────────────
  {
    id: 'forms',
    title: 'Forms',
    description: 'Submit leave and other requests',
    icon: ClipboardList,
    route: '/(app)/shared/forms',
    group: 'me',
    roles: ['admin', 'technician'],
    alsoMatches: ['/shared/submit-form'],
  },
  {
    id: 'my-requests',
    title: 'My Requests',
    description: 'Track your submissions',
    icon: FileText,
    route: '/(app)/shared/my-requests',
    group: 'me',
    roles: ['admin', 'technician'],
  },
  {
    id: 'my-documents',
    title: 'My Documents',
    description: 'View your HR documents',
    icon: FolderOpen,
    route: '/(app)/shared/my-documents',
    group: 'me',
    roles: ['admin', 'technician'],
  },
  {
    id: 'see-docs',
    title: 'See Docs',
    description: 'Documents you have been granted access to',
    icon: Eye,
    route: '/(app)/shared/granted-documents',
    group: 'me',
    roles: ['admin'],
    requiresDocGrants: true,
  },
];

/** Where each role's own dashboard lives. */
export const HOME_ROUTE: Record<Role, string> = {
  superuser: '/(app)/superuser',
  hr: '/(app)/hr',
  admin: '/(app)/admin',
  technician: '/(app)/technician',
};

export const HOME_ICON = LayoutDashboard;

export type ResolvedFeature = {
  id: string;
  title: string;
  description: string;
  icon: Icon;
  route: string;
  group: FeatureGroup;
  dashboard: boolean;
  sidebar: boolean;
  alsoMatches: string[];
};

/** Work out exactly which features this person gets, with role-specific wording. */
export function resolveFeatures(args: {
  role: Role;
  granted: readonly string[];
  hasDocGrants: boolean;
}): ResolvedFeature[] {
  const { role, granted, hasDocGrants } = args;
  return FEATURES
    .filter(f => f.roles.includes(role))
    .filter(f => !f.permission || hasPermission(role, granted, f.permission))
    .filter(f => !f.requiresDocGrants || hasDocGrants)
    .map(f => ({
      id: f.id,
      title: f.titleByRole?.[role] ?? f.title,
      description: f.descriptionByRole?.[role] ?? f.description,
      icon: f.icon,
      route: f.route,
      group: f.group,
      dashboard: f.dashboard !== false,
      sidebar: f.sidebar !== false,
      alsoMatches: f.alsoMatches ?? [],
    }));
}

/**
 * Expo Router strips "(group)" folders from the browser URL, so
 * '/(app)/callouts/(admin)/dashboard' is really '/callouts/dashboard' in
 * usePathname(). Comparing the raw route to the pathname never matched,
 * which is why the sidebar never highlighted the current page.
 */
export function normalizeRoute(route: string): string {
  const cleaned = route.replace(/\/\([^/)]*\)/g, '');
  return cleaned === '' ? '/' : cleaned;
}

/**
 * Which item should be highlighted for this URL? The longest matching
 * prefix wins, so '/hr' (HR's dashboard) doesn't swallow '/hr/employees'.
 */
export function findActiveId(
  pathname: string,
  items: { id: string; route: string; alsoMatches?: string[] }[]
): string | null {
  let bestId: string | null = null;
  let bestLen = -1;
  for (const item of items) {
    const prefixes = [normalizeRoute(item.route), ...(item.alsoMatches ?? [])];
    for (const p of prefixes) {
      const hit = pathname === p || pathname.startsWith(p + '/');
      if (hit && p.length > bestLen) {
        bestId = item.id;
        bestLen = p.length;
      }
    }
  }
  return bestId;
}
