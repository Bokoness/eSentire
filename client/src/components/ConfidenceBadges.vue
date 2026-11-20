<script setup lang="ts">
import type { ConfidenceView } from '../api/types';

// Each axis is shown only if the source stated it. Nothing is merged or converted:
// HIGH stays "strength: high" (not confirmed), a number stays a number.
defineProps<{ confidence: ConfidenceView }>();

const strengthClass: Record<string, string> = {
  high: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  medium: 'bg-sky-50 text-sky-800 border-sky-200',
  low: 'bg-slate-100 text-slate-700 border-slate-300',
};
const assessmentClass: Record<string, string> = {
  confirmed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  reported: 'bg-sky-50 text-sky-800 border-sky-200',
  suspected: 'bg-amber-50 text-amber-800 border-amber-200',
};
</script>

<template>
  <span class="inline-flex flex-wrap gap-1">
    <span v-if="confidence.unknown" class="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-slate-600" title="The source gave no confidence value">
      Confidence: Unknown
    </span>
    <span v-if="confidence.strength" class="rounded border px-1.5 py-0.5 text-xs" :class="strengthClass[confidence.strength]" title="Strength as stated by the source">
      {{ confidence.strength }}
    </span>
    <span v-if="confidence.assessment" class="rounded border px-1.5 py-0.5 text-xs" :class="assessmentClass[confidence.assessment]" title="Assessment as stated by the source">
      {{ confidence.assessment }}
    </span>
    <span v-if="confidence.score !== null" class="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-xs text-slate-700" title="Numeric confidence exactly as given by the source">
      {{ confidence.score }}
    </span>
  </span>
</template>
