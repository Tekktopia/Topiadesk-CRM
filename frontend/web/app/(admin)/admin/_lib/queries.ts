'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';
import type { BranchDto, DepartmentDto, ExchangeRateDto, FieldPermissionCatalog, FieldPermissionDto, PendingRoleGrantDto, PermissionDto, RoleDto, UserDto } from './types';

/** Shared reference-data queries reused across several admin pages (e.g.
 * department/branch pickers on the Users and Teams pages). Kept in one
 * place so the queryKey stays consistent and TanStack Query's cache is
 * shared instead of each page re-fetching independently. */

export function useDepartments() {
  return useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: () => apiFetch<DepartmentDto[]>('/api/admin/departments'),
  });
}

export function useBranches() {
  return useQuery({
    queryKey: ['admin', 'branches'],
    queryFn: () => apiFetch<BranchDto[]>('/api/admin/branches'),
  });
}

export function useRoles() {
  return useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => apiFetch<RoleDto[]>('/api/admin/roles'),
  });
}

export function useRoleGrants() {
  return useQuery({
    queryKey: ['admin', 'role-grants'],
    queryFn: () => apiFetch<PendingRoleGrantDto[]>('/api/admin/role-grants'),
  });
}

export function usePermissions() {
  return useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: () => apiFetch<PermissionDto[]>('/api/admin/permissions'),
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ['admin', 'users', 'all'],
    queryFn: () => apiFetch<UserDto[]>('/api/admin/users?take=200'),
  });
}

/** FIELD_PERMISSION_CATALOG mirrored to the client — which fields are gate-able per resource, so the admin UI can offer a dropdown instead of a free-text field name. */
export function useFieldPermissionCatalog() {
  return useQuery({
    queryKey: ['admin', 'field-permissions', 'catalog'],
    queryFn: () => apiFetch<FieldPermissionCatalog>('/api/admin/field-permissions/catalog'),
    staleTime: Infinity,
  });
}

export function useFieldPermissions(roleId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'field-permissions', roleId],
    queryFn: () => apiFetch<FieldPermissionDto[]>(`/api/admin/field-permissions?roleId=${roleId}`),
    enabled: Boolean(roleId),
  });
}

export function useExchangeRates() {
  return useQuery({
    queryKey: ['admin', 'exchange-rates'],
    queryFn: () => apiFetch<ExchangeRateDto[]>('/api/admin/exchange-rates'),
  });
}
