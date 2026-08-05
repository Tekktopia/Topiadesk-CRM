'use client';

import { AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, X } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@topiadesk/ui';
import { ReportChart } from '../(reports)/_components/report-chart';
import { ReportResultTable } from '../(reports)/_components/report-result-table';
import type { ReportChartType, ReportResult } from '../(reports)/_lib/types';
import type { RenderedDashboardWidget } from './types';

/**
 * One dashboard tile — renders a rendered widget's chart (reusing the
 * Reports module's ReportChart dispatcher + ReportResultTable verbatim, no
 * new charting code) or an inline error state when the widget's report key
 * is stale or its stored filters no longer validate (RenderedDashboard's
 * per-widget degrade-gracefully contract — see backend's
 * dashboard-render.util.ts).
 */
export function DashboardWidgetTile({
  widget,
  editable = false,
  isFirst = false,
  isLast = false,
  onRemove,
  onMoveUp,
  onMoveDown,
  onMoveLeft,
  onMoveRight,
}: {
  widget: RenderedDashboardWidget;
  editable?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">{widget.title}</CardTitle>
        {editable ? (
          <div className="flex items-center gap-0.5">
            {onMoveLeft ? (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onMoveLeft} aria-label="Move widget left">
                <ArrowLeft className="h-3 w-3" aria-hidden />
              </Button>
            ) : null}
            {onMoveRight ? (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onMoveRight} aria-label="Move widget right">
                <ArrowRight className="h-3 w-3" aria-hidden />
              </Button>
            ) : null}
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={isFirst} onClick={onMoveUp} aria-label="Move widget up">
              <ArrowUp className="h-3 w-3" aria-hidden />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={isLast} onClick={onMoveDown} aria-label="Move widget down">
              <ArrowDown className="h-3 w-3" aria-hidden />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={onRemove} aria-label="Remove widget">
              <X className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="flex-1">
        {widget.error ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <AlertTriangle className="h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="text-xs text-muted-foreground">{widget.error}</p>
          </div>
        ) : widget.chartType === 'table' ? (
          <ReportResultTable result={widget.result as ReportResult} />
        ) : (
          <ReportChart type={widget.chartType as ReportChartType} result={widget.result as ReportResult} />
        )}
      </CardContent>
    </Card>
  );
}
