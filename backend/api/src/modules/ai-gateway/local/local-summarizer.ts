/**
 * Local, extractive replacement for Claude's `summarize()` prose generation.
 * Embedding-based centroid scoring (a lightweight LexRank/TextRank variant):
 * split into sentences, embed each one plus the whole document, score each
 * sentence by cosine-similarity to the document's own centroid embedding
 * (a sentence close to the "average meaning" of the whole text is a good
 * stand-in for it), pick the top-scoring N, then restore original reading
 * order before joining — summaries read as a coherent excerpt, not a
 * shuffled bag of highlights.
 *
 * Takes `embed` as a parameter (rather than importing LocalEmbeddingsService
 * directly) so the scoring logic itself stays a pure, dependency-free,
 * trivially-testable function — only the one call site threads the real
 * embedding function through.
 */

const MAX_SUMMARY_SENTENCES = 4;
const MIN_SENTENCE_CHARS = 12; // filters out fragments like "Ok." or "Thanks." that add no summary value.

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_SENTENCE_CHARS);
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

function centroid(vectors: number[][]): number[] {
  const dim = vectors[0]!.length;
  const sum = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) sum[i]! += v[i]!;
  }
  return sum.map((s) => s / vectors.length);
}

export async function summarizeText(text: string, embed: (texts: string[]) => Promise<number[][]>, maxSentences = MAX_SUMMARY_SENTENCES): Promise<string> {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return '';
  if (sentences.length <= maxSentences) return sentences.join(' ');

  const embeddings = await embed(sentences);
  const docCentroid = centroid(embeddings);

  const scored = embeddings.map((vec, i) => ({
    index: i,
    sentence: sentences[i]!,
    // Small positional boost for the opening sentence — CRM notes/records
    // disproportionately front-load the key fact ("Client called to report
    // a claim...") — plus a mild length penalty so a very short, low-
    // information sentence doesn't win purely on topical centrality.
    score: dot(vec, docCentroid) + (i === 0 ? 0.05 : 0) - Math.max(0, 40 - sentences[i]!.length) * 0.0015,
  }));

  const top = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index);

  return top.map((s) => s.sentence).join(' ');
}
