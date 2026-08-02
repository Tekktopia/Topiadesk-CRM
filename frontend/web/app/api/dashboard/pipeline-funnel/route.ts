import { NextResponse } from 'next/server';
import { ApiUnauthenticatedError, fetchApi } from '@/lib/api/server-fetch';

export const runtime = 'nodejs';

interface StageRow {
  id: string;
  name: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
}
interface PipelineRow {
  id: string;
  name: string;
  isActive: boolean;
}
interface PipelineDetailRow extends PipelineRow {
  stages: StageRow[];
}
interface OpportunityRow {
  id: string;
  pipelineStageId: string;
  amount: string;
}

export interface FunnelStage {
  stageId: string;
  name: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
  count: number;
  value: number;
}
export interface PipelineFunnelResponse {
  pipelineId: string | null;
  pipelineName: string | null;
  stages: FunnelStage[];
}

/**
 * GET /api/dashboard/pipeline-funnel — aggregates CRM opportunity-by-stage
 * counts/values for the dashboard's pipeline funnel chart. There is no
 * single backend endpoint for this, so this Route Handler composes three
 * upstream calls server-side (GET /crm/pipelines to find the active
 * pipeline, GET /crm/pipelines/:id for its ordered stages, GET
 * /crm/opportunities?pipelineId=:id for every opportunity currently in it)
 * and returns one small aggregated payload — reading another module's API
 * (crm) is fine per the build brief; only that module's frontend directory
 * is off-limits, which this Route Handler is not part of.
 */
export async function GET(): Promise<NextResponse<PipelineFunnelResponse>> {
  try {
    const pipelinesRes = await fetchApi('/crm/pipelines');
    if (!pipelinesRes.ok) {
      return NextResponse.json({ pipelineId: null, pipelineName: null, stages: [] });
    }
    const pipelines = (await pipelinesRes.json()) as PipelineRow[];
    const pipeline = pipelines.find((p) => p.isActive) ?? pipelines[0];
    if (!pipeline) {
      return NextResponse.json({ pipelineId: null, pipelineName: null, stages: [] });
    }

    const [detailRes, opportunitiesRes] = await Promise.all([
      fetchApi(`/crm/pipelines/${pipeline.id}`),
      fetchApi(`/crm/opportunities?pipelineId=${pipeline.id}`),
    ]);
    const detail = detailRes.ok ? ((await detailRes.json()) as PipelineDetailRow) : { ...pipeline, stages: [] };
    const opportunities = opportunitiesRes.ok ? ((await opportunitiesRes.json()) as OpportunityRow[]) : [];

    const byStage = new Map<string, { count: number; value: number }>();
    for (const opp of opportunities) {
      const bucket = byStage.get(opp.pipelineStageId) ?? { count: 0, value: 0 };
      bucket.count += 1;
      bucket.value += Number(opp.amount) || 0;
      byStage.set(opp.pipelineStageId, bucket);
    }

    const stages: FunnelStage[] = [...detail.stages]
      .sort((a, b) => a.order - b.order)
      .map((stage) => ({
        stageId: stage.id,
        name: stage.name,
        order: stage.order,
        isWon: stage.isWon,
        isLost: stage.isLost,
        count: byStage.get(stage.id)?.count ?? 0,
        value: byStage.get(stage.id)?.value ?? 0,
      }));

    return NextResponse.json({ pipelineId: pipeline.id, pipelineName: pipeline.name, stages });
  } catch (err) {
    if (err instanceof ApiUnauthenticatedError) {
      return NextResponse.json({ pipelineId: null, pipelineName: null, stages: [] }, { status: 401 });
    }
    console.error('[dashboard/pipeline-funnel] failed', err);
    return NextResponse.json({ pipelineId: null, pipelineName: null, stages: [] }, { status: 200 });
  }
}
