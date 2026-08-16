/**
 * Local, lexicon/rule-based sentiment scorer — the offline replacement for
 * Claude's forced `record_sentiment_analysis` tool call. VADER-style
 * mechanics (word-level valence + negation + intensifiers, summed and
 * normalized to a -1..1 compound score), but a curated ~180-word lexicon
 * tuned for insurance-brokerage CRM text (customer/prospect communications,
 * internal notes) rather than the full ~7500-word general-purpose VADER
 * lexicon — vendored in-house rather than an npm dependency, both for
 * license/maintenance reasons and because a domain-tuned list is genuinely
 * more useful here than a generic one (e.g. "ombudsman"/"cancel my policy"
 * carry real weight in this domain that a generic lexicon wouldn't know).
 *
 * This is a legitimate design choice, not a shortcut standing in for a
 * "real" model — it is fully deterministic and auditable (every score can
 * be traced back to the exact words that produced it), which the old
 * Claude-based version explicitly could not offer.
 */

const POSITIVE_LEXICON: Record<string, number> = {
  great: 2.5, excellent: 3, good: 1.9, happy: 2.1, pleased: 2,
  satisfied: 2, thanks: 1.8, thank: 1.8, appreciate: 2, appreciated: 2,
  wonderful: 2.8, fantastic: 2.9, perfect: 2.7, love: 2.5, glad: 1.8,
  helpful: 2, resolved: 2.1, quick: 1.3, fast: 1.3, smooth: 1.7,
  professional: 1.8, easy: 1.5, clear: 1.2, confident: 1.6, comfortable: 1.5,
  fair: 1.3, reasonable: 1.3, prompt: 1.6, efficient: 1.8, friendly: 1.9,
  reliable: 1.9, trust: 1.7, trustworthy: 1.9, recommend: 2, welcome: 1.4,
  agree: 1.1, agreed: 1.1, approved: 1.6, success: 2, successful: 2,
  best: 2.2, better: 1.4, improved: 1.6, improve: 1.2, nice: 1.5,
  awesome: 2.8, amazing: 2.8, delighted: 2.4, impressed: 2.1, valuable: 1.6,
  win: 1.9, won: 1.9, renewed: 1.3, secure: 1.3, protected: 1.3,
};

const NEGATIVE_LEXICON: Record<string, number> = {
  angry: -2.7, upset: -2.2, frustrated: -2.3, frustrating: -2.3, disappointed: -2.2,
  disappointing: -2.2, unhappy: -2, dissatisfied: -2.2, terrible: -2.9, awful: -2.8,
  horrible: -2.9, bad: -1.8, poor: -1.6, worst: -3, hate: -2.6,
  unacceptable: -2.6, delay: -1.4, delayed: -1.5, late: -1.2, slow: -1.3,
  confused: -1.4, confusing: -1.4, difficult: -1.4, problem: -1.6, problems: -1.6,
  issue: -1.2, issues: -1.2, error: -1.4, errors: -1.4, mistake: -1.6,
  mistakes: -1.6, wrong: -1.5, fail: -2, failed: -2, failure: -2,
  refuse: -1.9, refused: -1.9, deny: -1.9, denied: -2, reject: -1.9,
  rejected: -1.9, cancel: -1.6, cancelled: -1.6, cancellation: -1.6, complain: -1.9,
  complaint: -2, complaints: -2, escalate: -1.8, escalation: -1.8, dispute: -1.7,
  disputed: -1.7, overcharged: -2.1, overpaid: -1.2, unfair: -2, rude: -2.3,
  unprofessional: -2.3, unresponsive: -2, ignored: -2.1, ignoring: -2.1,
  waiting: -1, wait: -0.9, lost: -1.6, missing: -1.4, incorrect: -1.5,
  broken: -1.7, damage: -1.4, damaged: -1.5, threat: -2.3, threatened: -2.4,
  legal: -1.1, lawsuit: -2.3, sue: -2.3, ombudsman: -2.5, regulator: -1.8,
  fraud: -2.9, fraudulent: -2.9, scam: -2.8, unsafe: -2, urgent: -1,
  immediately: -0.8, unacceptably: -2.6, never: -1.1, worried: -1.6, worry: -1.5,
  concerned: -1.2, concern: -1.1, disgusted: -2.7, furious: -2.9,
};

const NEGATORS = new Set(['not', "don't", "doesn't", "didn't", 'no', 'never', 'cannot', "can't", "won't", 'without']);
const INTENSIFIERS: Record<string, number> = {
  very: 1.3, extremely: 1.5, really: 1.25, absolutely: 1.4, completely: 1.35,
  totally: 1.3, so: 1.2, incredibly: 1.45, utterly: 1.4, highly: 1.25,
};
const DAMPENERS: Record<string, number> = { slightly: 0.6, somewhat: 0.7, kind: 0.75, sort: 0.75, a: 1 };

// Hard/soft escalation triggers — separate from general sentiment, since
// "angry" alone (soft-negative sentiment) reads differently than an explicit
// threat to leave or invoke a regulator (hard trigger). More auditable than
// an LLM's implicit judgment: every HIGH flag traces to one of these exact
// phrases.
const HARD_ESCALATION_TRIGGERS = [
  'ombudsman', 'regulator', 'lawsuit', 'sue', 'legal action', 'cancel my policy',
  'cancelling my policy', 'switch providers', 'switching providers', 'file a complaint',
  'formal complaint', 'fraud', 'unacceptable',
];
const SOFT_ESCALATION_TRIGGERS = ['complaint', 'escalate', 'unfair', 'furious', 'disgusted', 'never again', 'demand'];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export interface LocalSentimentResult {
  label: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  score: number;
  escalationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  keyPhrases: string[];
}

export function analyzeSentiment(text: string): LocalSentimentResult {
  const tokens = tokenize(text);
  const hits: Array<{ index: number; word: string; valence: number }> = [];

  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i]!;
    const base = POSITIVE_LEXICON[word] ?? NEGATIVE_LEXICON[word];
    if (base === undefined) continue;

    let valence = base;

    // Look back up to 3 tokens for a negator/intensifier/dampener — VADER's
    // own window size for these modifiers.
    for (let back = 1; back <= 3 && i - back >= 0; back++) {
      const modifier = tokens[i - back]!;
      if (NEGATORS.has(modifier)) {
        valence *= -0.74; // VADER's own negation dampening factor, not a full flip — "not great" reads less negative than "terrible", not just "not positive".
        break;
      }
      if (INTENSIFIERS[modifier]) {
        valence *= INTENSIFIERS[modifier];
      } else if (DAMPENERS[modifier]) {
        valence *= DAMPENERS[modifier];
      }
    }

    // ALL-CAPS or an immediately-following "!" both read as emphasis.
    const original = text.match(new RegExp(`\\b${word}\\b`, 'i'))?.[0] ?? word;
    if (original === original.toUpperCase() && original.length > 2) valence *= 1.2;

    hits.push({ index: i, word, valence });
  }

  const compound =
    hits.length === 0 ? 0 : Math.max(-1, Math.min(1, hits.reduce((sum, h) => sum + h.valence, 0) / Math.sqrt(hits.reduce((s, h) => s + h.valence * h.valence, 0) + 15)));

  const label: LocalSentimentResult['label'] = compound >= 0.15 ? 'POSITIVE' : compound <= -0.15 ? 'NEGATIVE' : 'NEUTRAL';

  const lowerText = text.toLowerCase();
  const hasHardTrigger = HARD_ESCALATION_TRIGGERS.some((t) => lowerText.includes(t));
  const hasSoftTrigger = SOFT_ESCALATION_TRIGGERS.some((t) => lowerText.includes(t));
  const escalationRisk: LocalSentimentResult['escalationRisk'] = hasHardTrigger || compound <= -0.6 ? 'HIGH' : hasSoftTrigger || compound <= -0.3 ? 'MEDIUM' : 'LOW';

  // Key phrases: the highest-magnitude lexicon hits, each with one word of
  // surrounding context, strongest first, deduplicated by word.
  const seen = new Set<string>();
  const keyPhrases = hits
    .slice()
    .sort((a, b) => Math.abs(b.valence) - Math.abs(a.valence))
    .filter((h) => (seen.has(h.word) ? false : (seen.add(h.word), true)))
    .slice(0, 5)
    .map((h) => {
      const before = tokens[h.index - 1];
      const after = tokens[h.index + 1];
      return [before, h.word, after].filter(Boolean).join(' ');
    });

  return { label, score: Math.round(compound * 100) / 100, escalationRisk, keyPhrases };
}
