import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useFetch } from './useFetch';
import { useAuth } from './auth';
import { isSuper } from './portal';

/**
 * What the signed-in person may do, as the API decides it.
 *
 * `/users/me/permissions` answers with the same resolution the API checks on
 * every request — head office and laboratories get everything; an employee
 * gets their own grant, else their role's, limited to the permissions their
 * side can have. So a control hidden on `can()` is exactly one the API would
 * refuse. The API is the boundary; this is so the panel does not offer a
 * button that would only answer with an error.
 *
 * `staffOf` is whose employee the person is:
 *
 *   'laboratory'   a laboratory's staff — the counter menu, narrowed by grants
 *   'head_office'  head office's staff — head office's menu, narrowed by grants
 *   null           head office or a laboratory account themselves
 *
 * Loaded once at sign-in: a handful of rows that do not change mid-task. A
 * change made on a permission screen reaches the person on their next load.
 */

export type ActionType =
  | 'product_collection'
  | 'report'
  | 'customer'
  | 'laboratory'
  | 'visitor_book'
  | 'website_enquiry'
  | 'website_home'
  | 'website_report'
  | 'website_blog'
  // Not employee permissions — always granted to head office and laboratories,
  // never to employees — but still asked about by a few screens.
  | 'account'
  | 'attendance'
  | 'message'
  | 'admin_employee'
  | 'employee_management'
  | 'website_contact'
  | 'website_education';

export type Ability = 'view' | 'create' | 'update' | 'delete';
export type StaffKind = 'laboratory' | 'head_office';

interface Permission {
  action_type: string;
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

interface PermissionState {
  can: (action: ActionType, ability: Ability) => boolean;
  /** Whose employee this is; null for head office and laboratory accounts. */
  staffOf: StaffKind | null;
  /**
   * Head office, or one of its employees — the two whose screens span every
   * laboratory. What the employee may do on them is still `can()`.
   */
  headOffice: boolean;
  loading: boolean;
}

const PermissionContext = createContext<PermissionState | null>(null);

export function PermissionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data, loading } = useFetch<{ data: Permission[]; staff_of?: StaffKind | null }>('/users/me/permissions');

  const value = useMemo<PermissionState>(() => {
    const byAction = new Map<string, Permission>((data?.data ?? []).map((p) => [p.action_type, p]));
    const staffOf = data?.staff_of ?? null;
    return {
      loading,
      staffOf,
      headOffice: isSuper(user) || staffOf === 'head_office',
      can(action, ability) {
        // While loading, assume nothing is permitted. A button that appears
        // and then vanishes is worse than one that appears a moment late.
        if (loading) return false;
        return Boolean(byAction.get(action)?.[ability]);
      },
    };
  }, [data, loading, user]);

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions(): PermissionState {
  const ctx = useContext(PermissionContext);
  if (!ctx) throw new Error('usePermissions must be used inside PermissionProvider');
  return ctx;
}
