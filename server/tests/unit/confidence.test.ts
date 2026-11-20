import { deriveConfidence } from '../../src/services/confidence';

describe('deriveConfidence', () => {
  it('HIGH is a strength, never "confirmed"', () => {
    expect(deriveConfidence({ confidence_label: 'HIGH' }, null, null)).toMatchObject({ strength: 'high', assessment: null, score: null, unknown: false });
  });

  it('CONFIRMED / confirmed are assessments, not strengths', () => {
    expect(deriveConfidence({ confidence_label: 'CONFIRMED' }, null, null)).toMatchObject({ strength: null, assessment: 'confirmed' });
    expect(deriveConfidence({ confidence: 'confirmed' }, null, null)).toMatchObject({ assessment: 'confirmed' });
  });

  it('SUSPECTED is never turned into a number', () => {
    expect(deriveConfidence({ confidence_label: 'SUSPECTED', qualifier: 'suspected' }, null, 'suspected')).toMatchObject({ assessment: 'suspected', score: null });
  });

  it('a number stays a number', () => {
    expect(deriveConfidence({ confidence: 0.35, qualifier: 'suspected' }, 0.35, 'suspected')).toMatchObject({ score: 0.35, assessment: 'suspected', strength: null });
  });

  it('missing confidence is unknown, not confirmed', () => {
    expect(deriveConfidence(null, null, null)).toEqual({ raw: null, strength: null, assessment: null, score: null, unknown: true });
  });
});
