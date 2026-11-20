export const ENTITY_TYPES = [
  'threat_actor',
  'vulnerability',
  'campaign',
  'malware',
  'tool',
  'software',
  'sector',
  'infrastructure',
] as const;

export interface KeyFact {
  label: string;
  value: string;
}

type Attrs = Record<string, unknown>;

const str = (v: unknown): string | null => {
  if (typeof v === 'number') return String(v);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};

/** One type-specific fact that makes a search result useful at a glance. */
export function keyFact(type: string, attributes: Attrs): KeyFact | null {
  switch (type) {
    case 'threat_actor': {
      const origin = str(attributes.origin_country);
      if (origin) return { label: 'Origin', value: origin };
      const motivation = str(attributes.motivation);
      if (motivation) return { label: 'Motivation', value: motivation };
      const firstSeen = str(attributes.first_seen);
      return firstSeen ? { label: 'First seen', value: firstSeen } : null;
    }
    case 'vulnerability': {
      // cvss may be a number or a string like "9.8" in the seed; displayed as given.
      const cvss = str(attributes.cvss);
      return { label: 'CVSS', value: cvss ?? 'not provided' };
    }
    case 'campaign': {
      const firstSeen = str(attributes.first_seen);
      return firstSeen ? { label: 'First seen', value: firstSeen } : null;
    }
    case 'infrastructure': {
      const kind = str(attributes.kind);
      return kind ? { label: 'Kind', value: kind } : null;
    }
    default:
      return null;
  }
}

/** Attributes shown on the entity page; entity-level confidence/sources are returned separately. */
export function displayAttributes(attributes: Attrs): Attrs {
  const { confidence: _c, sources: _s, ...rest } = attributes;
  return rest;
}
