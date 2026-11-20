<script setup lang="ts">
import type { GraphEdge } from '../api/types';
import ConfidenceBadges from './ConfidenceBadges.vue';

// One claim = one statement by one source. Rendered the same way in the list and in the graph panel.
defineProps<{ claim: GraphEdge }>();
</script>

<template>
  <div class="text-sm" :class="claim.status === 'retracted' ? 'opacity-70' : ''">
    <div class="flex flex-wrap items-center gap-1.5">
      <span v-if="claim.status === 'retracted'" class="rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white uppercase">Retracted</span>
      <span v-else-if="claim.status" class="rounded bg-slate-700 px-1.5 py-0.5 text-xs text-white">{{ claim.status }}</span>
      <ConfidenceBadges :confidence="claim.confidence" />
      <span v-if="claim.qualifier && claim.qualifier !== claim.confidence.assessment" class="text-xs text-slate-600">qualifier: {{ claim.qualifier }}</span>
    </div>

    <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600" :class="claim.status === 'retracted' ? 'line-through decoration-red-400' : ''">
      <span>
        Source: <span class="font-medium text-slate-800">{{ claim.source.name }}</span>
        <span v-if="claim.source.reliability"> · reliability {{ claim.source.reliability }}</span>
        <span v-else-if="claim.source.type === 'derived'"> · derived from dataset text (not an independent source)</span>
      </span>
      <span v-if="claim.asOf">· as of {{ claim.asOf }}</span>
      <span class="font-mono text-slate-400">{{ claim.externalId.startsWith('derived-') ? 'text-derived' : claim.externalId }}</span>
    </div>

    <p v-if="claim.source.lowReliability" class="mt-1 text-xs text-amber-800">
      ⚠ Low-reliability source ({{ claim.source.reliability }}): treat as unverified.
    </p>
    <p v-for="w in claim.warnings" :key="w.message" class="mt-1 text-xs text-amber-800">⚠ Date anomaly: {{ w.message }}. Kept as reported (possible zero-day or report date).</p>
    <p v-if="claim.note" class="mt-1 text-xs text-slate-700">Note: {{ claim.note }}</p>
    <p v-if="claim.evidence" class="mt-1 text-xs text-slate-700">
      Evidence: <q class="italic">{{ claim.evidence }}</q>
      <span v-if="claim.derivation" class="text-slate-500"> (rule “{{ claim.derivation.rule }}” on {{ claim.derivation.recordId }}.{{ claim.derivation.field }})</span>
    </p>
  </div>
</template>
