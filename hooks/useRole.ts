import React from 'react';

type UserRole = 'technician' | 'admin' | 'superuser';

interface RoleContextType {
  role: UserRole;
  setRole: (role: UserRole) => void;
  can: (permission: string) => boolean;
  isTechnician: boolean;
  isAdmin: boolean;
  isSuperuser: boolean;
}

const RoleContext = React.createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = React.useState<UserRole>('technician');

  const permissions = {
    technician: [
      'view_assigned_callouts',
      'update_callout_status',
      'request_leave',
      'view_own_schedule',
      'view_own_profile',
    ],
    admin: [
      'view_all_callouts',
      'create_callout',
      'edit_callout',
      'assign_technician',
      'manage_team',
      'approve_leave',
      'view_reports',
      'view_all_profiles',
    ],
    superuser: [
      'all',
      'delete_callout',
      'delete_user',
      'impersonate_user',
      'manage_roles',
      'system_settings',
    ],
  };

  const can = (permission: string) => {
    if (role === 'superuser') return true;
    return permissions[role]?.includes(permission) || false;
  };

  const value = {
    role,
    setRole,
    can,
    isTechnician: role === 'technician',
    isAdmin: role === 'admin' || role === 'superuser',
    isSuperuser: role === 'superuser',
  };

  return React.createElement(
    RoleContext.Provider,
    { value },
    children
  );
}

export function useRole() {
  const context = React.useContext(RoleContext);
  if (context === undefined) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}