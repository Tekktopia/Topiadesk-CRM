'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Mail, Pencil, Phone, Trash2, Users } from 'lucide-react';
import { Badge, Button } from '@topiadesk/ui';
import type { DepartmentDto, UserDto } from '../_lib/types';

interface DepartmentNode extends DepartmentDto {
  children: DepartmentNode[];
}

function buildTree(departments: DepartmentDto[]): DepartmentNode[] {
  const nodesById = new Map<string, DepartmentNode>(departments.map((d) => [d.id, { ...d, children: [] }]));
  const roots: DepartmentNode[] = [];
  for (const node of nodesById.values()) {
    if (node.parentDepartmentId && nodesById.has(node.parentDepartmentId)) {
      nodesById.get(node.parentDepartmentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const byName = (a: DepartmentNode, b: DepartmentNode) => a.name.localeCompare(b.name);
  const sortRec = (list: DepartmentNode[]) => {
    list.sort(byName);
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

/** Org-chart view of Departments — always shows the full parent/child
 * hierarchy via indentation (that structure is small and is the point of
 * the page), with each node's user roster as a separate opt-in disclosure
 * so the page doesn't dump every user in the org by default. */
export function DepartmentTree({
  departments,
  usersByDepartment,
  canWrite,
  onEdit,
  onDelete,
}: {
  departments: DepartmentDto[];
  usersByDepartment: Map<string, UserDto[]>;
  canWrite: boolean;
  onEdit: (d: DepartmentDto) => void;
  onDelete: (d: DepartmentDto) => void;
}) {
  const tree = useMemo(() => buildTree(departments), [departments]);
  return (
    <div className="rounded-md border divide-y">
      {tree.map((node) => (
        <DepartmentNodeRow
          key={node.id}
          node={node}
          depth={0}
          usersByDepartment={usersByDepartment}
          canWrite={canWrite}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function DepartmentNodeRow({
  node,
  depth,
  usersByDepartment,
  canWrite,
  onEdit,
  onDelete,
}: {
  node: DepartmentNode;
  depth: number;
  usersByDepartment: Map<string, UserDto[]>;
  canWrite: boolean;
  onEdit: (d: DepartmentDto) => void;
  onDelete: (d: DepartmentDto) => void;
}) {
  const [rosterOpen, setRosterOpen] = useState(false);
  const users = usersByDepartment.get(node.id) ?? [];

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/40" style={{ paddingLeft: `${depth * 24 + 12}px` }}>
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setRosterOpen((v) => !v)}
          aria-label={rosterOpen ? `Hide ${node.name} users` : `Show ${node.name} users`}
        >
          <Users className="h-3.5 w-3.5" />
          {users.length}
        </button>
        <span className="font-medium text-foreground">{node.name}</span>
        <Badge variant="secondary" className="font-mono text-[10px]">
          {node.code}
        </Badge>
        {node.email ? (
          <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
            <Mail className="h-3 w-3" />
            {node.email}
          </span>
        ) : null}
        {node.phone ? (
          <span className="hidden items-center gap-1 text-xs text-muted-foreground md:flex">
            <Phone className="h-3 w-3" />
            {node.phone}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setRosterOpen((v) => !v)}
          >
            {rosterOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Users
          </Button>
          {canWrite ? (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${node.name}`} onClick={() => onEdit(node)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete ${node.name}`} onClick={() => onDelete(node)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {rosterOpen ? (
        <div className="border-t bg-muted/20 py-1.5" style={{ paddingLeft: `${depth * 24 + 36}px` }}>
          {users.length === 0 ? (
            <p className="px-3 py-1 text-xs text-muted-foreground">No users assigned to this department.</p>
          ) : (
            <ul className="space-y-1 pr-3">
              {users.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1 text-xs">
                  <span className="font-medium text-foreground">{u.fullName}</span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Mail className="h-3 w-3" />
                    {u.email}
                  </span>
                  {u.phone ? (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      {u.phone}
                    </span>
                  ) : null}
                  {u.roles.map((r) => (
                    <Badge key={r.id} variant="outline" className="text-[10px]">
                      {r.name}
                    </Badge>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {node.children.map((child) => (
        <DepartmentNodeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          usersByDepartment={usersByDepartment}
          canWrite={canWrite}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
