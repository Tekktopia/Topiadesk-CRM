/**
 * Local replacement for Claude's `categorize()`. A non-generative local
 * system cannot invent a novel label the way Claude could — this narrows
 * the value space to the closest match from a fixed candidate list
 * (confirmed acceptable — see the approved plan) rather than trying to fake
 * open-ended generation. Same response shape (`suggestedCategory: string`,
 * `confidence: 0..1`) as before, just a bounded set of possible strings.
 *
 * Candidates cover the categories that already show up across this CRM's
 * case/activity/knowledge-article domain — chosen to be genuinely useful
 * defaults for an insurance brokerage, not arbitrary examples.
 */

export const CATEGORY_CANDIDATES = [
  'Claims Inquiry',
  'Renewal Request',
  'Billing Dispute',
  'Coverage Question',
  'Policy Change Request',
  'Complaint / Escalation',
  'Cancellation Request',
  'New Business Inquiry',
  'General Inquiry',
] as const;

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

export interface LocalCategorizeResult {
  suggestedCategory: string;
  confidence: number;
}

/**
 * `candidateEmbeddings` must be `CATEGORY_CANDIDATES` embedded in the same
 * order — computed once and cached by the caller (see
 * AiGatewayService.categorize) rather than re-embedded on every request,
 * since the candidate list is fixed.
 */
export function classifyCategory(textEmbedding: number[], candidateEmbeddings: number[][]): LocalCategorizeResult {
  let bestIndex = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < candidateEmbeddings.length; i++) {
    const score = dot(textEmbedding, candidateEmbeddings[i]!);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  // Cosine similarity between two normalized embeddings is in [-1, 1];
  // rescale to a 0..1 confidence for the DTO's documented range rather than
  // exposing the raw, less-intuitive [-1,1] similarity value.
  const confidence = Math.max(0, Math.min(1, (bestScore + 1) / 2));
  return { suggestedCategory: CATEGORY_CANDIDATES[bestIndex]!, confidence: Math.round(confidence * 100) / 100 };
}
