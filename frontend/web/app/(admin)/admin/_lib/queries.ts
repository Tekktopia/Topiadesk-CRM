'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';
import type { BranchDto, DepartmentDto, PermissionDto, RoleDto, UserDto } from './types';

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
