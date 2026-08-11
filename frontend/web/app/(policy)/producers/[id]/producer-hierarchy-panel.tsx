'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@topiadesk/ui';
import { producerStatusVariant, producerTypeLabel } from '@/app/(policy)/lib/format';
import type { ProducerDto } from '@/app/(policy)/lib/types';

interface ProducerNode extends ProducerDto {
  children: ProducerNode[];
}

/** Same buildTree shape as app/(admin)/admin/departments/department-tree.tsx — flat list -> parent/child tree via parentProducerId, rooted at `rootId`. */
function buildSubtree(producers: ProducerDto[], rootId: string): ProducerNode[] {
  const nodesById = new Map<string, ProducerNode>(producers.map((p) => [p.id, { ...p, children: [] }]));
  for (const node of nodesById.values()) {
    if (node.parentProducerId && nodesById.has(node.parentProducerId)) {
      nodesById.get(node.parentProducerId)!.children.push(node);
    }
  }
  const root = nodesById.get(rootId);
  const roots = root ? root.children : [];
  const byName = (a: ProducerNode, b: ProducerNode) => a.name.localeCompare(b.name);
  const sortRec = (list: ProducerNode[]) => {
    list.sort(byName);
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

/** Sub-producers reporting (directly or transitively) to this producer. */
export function ProducerHierarchyPanel({ producerId, producers }: { producerId: string; producers: ProducerDto[] }) {
  const tree = React.useMemo(() => buildSubtree(producers, producerId), [producers, producerId]);

  if (tree.length === 0) {
    return <p className="text-sm text-muted-foreground">No sub-producers report to this producer.</p>;
  }

  return (
    <div className="rounded-md border divide-y">
      {tree.map((node) => (
        <ProducerNodeRow key={node.id} node={node} depth={0} />
      ))}
    </div>
  );
}

function ProducerNodeRow({ node, depth }: { node: ProducerNode; depth: number }) {
  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/40" style={{ paddingLeft: `${depth * 24 + 12}px` }}>
        {depth > 0 ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> : null}
        <Link href={`/producers/${node.id}`} className="font-medium text-foreground hover:underline">
          {node.name}
        </Link>
        <Badge variant="outline" className="text-[10px]">
          {producerTypeLabel(node.type)}
        </Badge>
        <Badge variant={producerStatusVariant(node.status)} className="text-[10px]">
          {node.status}
        </Badge>
        <span className="font-mono text-[10px] text-muted-foreground">{node.producerCode}</span>
      </div>
      {node.children.map((child) => (
        <ProducerNodeRow key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}
