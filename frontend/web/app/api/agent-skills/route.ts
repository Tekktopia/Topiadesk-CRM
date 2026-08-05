import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET/POST /api/agent-skills -> /agent-skills (AgentSkillsController). No dedicated management page in this batch — kept for parity with the build brief's BFF scope and available to a future SKILL_BASED assignment-rule UI. */
export async function GET(): Promise<NextResponse> {
  return proxyJson('/agent-skills');
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/agent-skills', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
