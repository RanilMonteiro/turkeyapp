import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { supabase } from '../lib/supabase';
import { PermissionKey, Role, hasPermission } from '../constants/permissions';
import { HOME_ROUTE, ResolvedFeature, resolveFeatures } from '../constants/features';

// ─────────────────────────────────────────────────────────────────────
// ACCESS — who is logged in, what role they have, what they're allowed.
//
// Loaded ONCE for the whole app (instead of every screen re-querying
// profiles + user_permissions on its own) and refreshed automatically on
// sign-in / sign-out / token refresh. Replaces the old hard-coded
// RoleProvider, which always reported everyone as a technician.
//
//   const { role, can, dashboardFeatures } = useAccess();
//   if (can('can_manage_sites')) { ... }
//
// NOTE: this only controls what the UI SHOWS. The database (RLS) is what
// actually enforces access — keep both in step.
// ─────────────────────────────────────────────────────────────────────

type Snapshot = {
  userId: string | null;
  role: Role | null;
  fullName: string;
  granted: string[];
  hasDocGrants: boolean;
};

const EMPTY: Snapshot = {
  userId: null,
  role: null,
  fullName: '',
  granted: [],
  hasDocGrants: false,
};

type AccessValue = {
  /** True only until the first load finishes. */
  loading: boolean;
  userId: string | null;
  role: Role | null;
  fullName: string;
  /** Raw granted keys from user_permissions. Prefer can(). */
  permissions: string[];
  /** The real answer: includes superuser / always-on rules. */
  can: (key: PermissionKey) => boolean;
  /** Everything this person may open, with role-specific wording. */
  features: ResolvedFeature[];
  dashboardFeatures: ResolvedFeature[];
  sidebarFeatures: ResolvedFeature[];
  homeRoute: string | null;
  /** Re-read from the database (e.g. right after editing your own access). */
  refresh: () => Promise<void>;
};

const AccessContext = createContext<AccessValue | undefined>(undefined);

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  // Guards against an older, slower load overwriting a newer one.
  const loadSeq = useRef(0);
  const currentUserId = useRef<string | null>(null);

  const load = useCallback(async (userId: string) => {
    const seq = ++loadSeq.current;
    currentUserId.current = userId;

    const [profileRes, permsRes, grantsRes] = await Promise.all([
      supabase.from('profiles').select('role, full_name').eq('id', userId).single(),
      supabase
        .from('user_permissions')
        .select('permission')
        .eq('user_id', userId)
        .eq('granted', true),
      // Only admins HR has granted document access to see "See Docs".
      supabase.from('document_access_grants').select('id').eq('admin_id', userId).limit(1),
    ]);

    if (seq !== loadSeq.current) return; // a newer load (or a sign-out) took over

    if (profileRes.error || !profileRes.data) {
      // Keep whatever we had rather than flashing everyone's menu away
      // because of one failed request.
      console.error('Access: could not load profile', profileRes.error);
      setLoading(false);
      return;
    }
    if (permsRes.error) console.error('Access: could not load permissions', permsRes.error);

    setSnap({
      userId,
      role: profileRes.data.role as Role,
      fullName: profileRes.data.full_name ?? '',
      granted: (permsRes.data ?? []).map((p: { permission: string }) => p.permission),
      hasDocGrants: (grantsRes.data?.length ?? 0) > 0,
    });
    setLoading(false);
  }, []);

  const clear = useCallback(() => {
    loadSeq.current++; // cancel anything in flight
    currentUserId.current = null;
    setSnap(EMPTY);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (session?.user) load(session.user.id);
      else clear();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Deferred on purpose: calling supabase from inside this callback
      // synchronously can deadlock the auth client.
      setTimeout(() => {
        if (!active) return;
        if (session?.user) load(session.user.id);
        else clear();
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [load, clear]);

  const refresh = useCallback(async () => {
    if (currentUserId.current) await load(currentUserId.current);
  }, [load]);

  const value = useMemo<AccessValue>(() => {
    const { role, granted, hasDocGrants } = snap;
    const features = role ? resolveFeatures({ role, granted, hasDocGrants }) : [];
    return {
      loading,
      userId: snap.userId,
      role,
      fullName: snap.fullName,
      permissions: granted,
      can: (key: PermissionKey) => hasPermission(role, granted, key),
      features,
      dashboardFeatures: features.filter(f => f.dashboard),
      sidebarFeatures: features.filter(f => f.sidebar),
      homeRoute: role ? HOME_ROUTE[role] : null,
      refresh,
    };
  }, [snap, loading, refresh]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess(): AccessValue {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error('useAccess must be used within an AccessProvider');
  return ctx;
}
