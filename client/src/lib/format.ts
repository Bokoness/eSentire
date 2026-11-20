import type { MatchedOn } from '../api/types';

export const TYPE_LABELS: Record<string, string> = {
  threat_actor: 'Threat actor',
  vulnerability: 'Vulnerability',
  campaign: 'Campaign',
  malware: 'Malware',
  tool: 'Tool',
  software: 'Software',
  sector: 'Sector',
  infrastructure: 'Infrastructure',
};

// One color per entity type, shared by badges, the graph and its legend.
export const TYPE_COLORS: Record<string, string> = {
  threat_actor: '#dc2626',
  vulnerability: '#d97706',
  campaign: '#7c3aed',
  malware: '#db2777',
  tool: '#0891b2',
  software: '#2563eb',
  sector: '#16a34a',
  infrastructure: '#475569',
};

export const typeLabel = (type: string) => TYPE_LABELS[type] ?? type;
export const typeColor = (type: string) => TYPE_COLORS[type] ?? '#64748b';

export const relLabel = (type: string) => type.replace(/_/g, ' ');

export const MATCH_LABELS: Record<MatchedOn, string> = {
  exact_name: 'Exact name',
  exact_alias: 'Exact alias',
  partial_name: 'Name contains',
  partial_alias: 'Alias contains',
  description: 'Description mentions',
};

export const ORIGIN_COUNTRIES: { code: string; label: string }[] = [
  // Kept in one place so it can later be replaced by values derived from the data (a facets endpoint).
  { code: 'RU', label: 'Russia (RU)' },
  { code: 'CN', label: 'China (CN)' },
  { code: 'KP', label: 'North Korea (KP)' },
  { code: 'IR', label: 'Iran (IR)' },
];

export function formatAttribute(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export const attributeLabel = (key: string) => key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
