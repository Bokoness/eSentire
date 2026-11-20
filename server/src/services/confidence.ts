// API-level view of a claim's confidence. Nothing here is stored; it is derived from the raw
// values on every read so the interpretation can change without re-ingesting.
//
// Three independent axes, each filled ONLY when the source said so explicitly:
//   strength   — high | medium | low          (how strong the source rates it)
//   assessment — confirmed | reported | suspected (epistemic state)
//   score      — the original number in [0,1]
// HIGH is never turned into "confirmed", SUSPECTED never into a number, and a missing value is
// "unknown" — not "confirmed".

export type Strength = 'high' | 'medium' | 'low';
export type Assessment = 'confirmed' | 'reported' | 'suspected';

export interface ConfidenceView {
  raw: Record<string, unknown> | null;
  strength: Strength | null;
  assessment: Assessment | null;
  score: number | null;
  unknown: boolean;
}

const STRENGTHS = new Set<string>(['high', 'medium', 'low']);
const ASSESSMENTS = new Set<string>(['confirmed', 'reported', 'suspected']);

export function deriveConfidence(raw: unknown, score: number | null, qualifier: string | null): ConfidenceView {
  const rawObj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  let strength: Strength | null = null;
  let assessment: Assessment | null = null;

  // Order matters only when two fields disagree: confidence, then confidence_label, then qualifier.
  const words = [rawObj?.confidence, rawObj?.confidence_label, qualifier]
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim().toLowerCase());
  for (const word of words) {
    if (!strength && STRENGTHS.has(word)) strength = word as Strength;
    if (!assessment && ASSESSMENTS.has(word)) assessment = word as Assessment;
  }

  return { raw: rawObj, strength, assessment, score, unknown: !strength && !assessment && score === null };
}
