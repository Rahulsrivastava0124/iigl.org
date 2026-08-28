import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useFetch } from './useFetch';

/**
 * The permission matrix, as the signed-in user sees it.
 *
 * `role_permissions` carries fourteen action types per role, each with view,
 * create, update and delete. The API enforces it on every request; this exists
 * so the panel does not offer a button the API would refuse. A control that
 * throws a permission error on click is worse than one that isn't there.
 *
 * Loaded once at sign-in rather than per screen — it is fourteen rows and it
 * does not change while someone is working.
 */

export type ActionType =
  | 'account'
  | 'admin_employee'
  | 'customer'
  | 'employee_management'
  | 'laboratory'
  | 'product_collection'
  | 'report'
  | 'visitor_book'
  | 'website_blog'
  | 'website_contact'
  | 'website_education'
  | 'website_enquiry'
  | 'website_home'
  | 'website_report';

export type Ability = 'view' | 'create' | 'update' | 'delete';

interface Permission {
  action_type: string;
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

interface PermissionState {
  can: (action: ActionType, ability: Ability) => boolean;
  loading: boolean;
}

const PermissionContext = createContext<PermissionState | null>(null);

export function PermissionProvider({ children }: { children: ReactNode }) {
  const { data, loading } = useFetch<{ data: Permission[] }>('/users/me/permissions');

  const value = useMemo<PermissionState>(() => {
    const byAction = new Map<string, Permission>(
      (data?.data ?? []).map((p) => [p.action_type, p]),
    );

    return {
      loading,
      can(action, ability) {
        // While the matrix is loading, assume nothing is permitted. Showing a
        // button and then removing it is worse than showing it a moment late.
        if (loading) return false;
        return Boolean(byAction.get(action)?.[ability]);
      },
    };
  }, [data, loading]);

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions(): PermissionState {
  const ctx = useContext(PermissionContext);
  if (!ctx) throw new Error('usePermissions must be used inside PermissionProvider');
  return ctx;
}
