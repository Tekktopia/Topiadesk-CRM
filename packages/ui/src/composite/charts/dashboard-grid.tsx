'use client';

import * as React from 'react';
import { ReactGridLayout, WidthProvider, type Layout } from 'react-grid-layout/legacy';

const GridLayoutWithWidth = WidthProvider(ReactGridLayout);

export interface GridLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

/**
 * Free-form drag-and-resize grid for dashboard widgets — react-grid-layout
 * (v1-compatible `/legacy` entry point: the well-documented flat-props
 * API, chosen over v2's newer hooks-based surface since this package needs
 * exactly the classic "layout array in, onLayoutChange array out"
 * contract and nothing more). 12-column grid matches
 * `SavedDashboard.layoutConfig`'s existing `{columns: 12, items: [...]}`
 * shape — no schema change needed, this just replaces how that array gets
 * populated (real drag/resize state instead of computed array-order math).
 *
 * The tile's own header becomes the drag handle (`.dashboard-grid-handle`)
 * rather than the whole tile — otherwise nothing inside a widget (a
 * button, a chart tooltip trigger) could ever receive a click without
 * first triggering a drag.
 */
export function DashboardGrid({
  layout,
  onLayoutChange,
  isDraggable = false,
  isResizable = false,
  rowHeight = 80,
  children,
}: {
  layout: GridLayoutItem[];
  onLayoutChange?: (layout: GridLayoutItem[]) => void;
  isDraggable?: boolean;
  isResizable?: boolean;
  rowHeight?: number;
  children: React.ReactNode;
}) {
  return (
    <GridLayoutWithWidth
      className="layout"
      layout={layout as Layout}
      cols={12}
      rowHeight={rowHeight}
      margin={[16, 16]}
      isDraggable={isDraggable}
      isResizable={isResizable}
      draggableHandle=".dashboard-grid-handle"
      compactType="vertical"
      onLayoutChange={(next) => onLayoutChange?.(next as GridLayoutItem[])}
    >
      {children}
    </GridLayoutWithWidth>
  );
}
