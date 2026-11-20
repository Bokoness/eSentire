<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import type { GraphEdge, GraphNode } from '../api/types';
import { groupClaims, type ClaimGroup } from '../lib/claims';
import { relLabel } from '../lib/format';
import { entityLink } from '../lib/navigation';
import ClaimDetails from './ClaimDetails.vue';
import TypeBadge from './TypeBadge.vue';

const props = defineProps<{ rootId: string; nodes: GraphNode[]; edges: GraphEdge[] }>();
const route = useRoute();

const nodeById = computed(() => new Map(props.nodes.map((n) => [n.id, n])));

const groups = computed(() => {
  const all = groupClaims(props.edges);
  const touchesRoot = (g: ClaimGroup) => g.fromId === props.rootId || g.toId === props.rootId;
  const byName = (a: ClaimGroup, b: ClaimGroup) =>
    a.type.localeCompare(b.type) || name(other(a)).localeCompare(name(other(b)));
  return {
    direct: all.filter(touchesRoot).sort(byName),
    further: all.filter((g) => !touchesRoot(g)).sort(byName),
  };
});

const name = (id: string) => nodeById.value.get(id)?.name ?? 'Unknown';
const other = (g: ClaimGroup) => (g.fromId === props.rootId ? g.toId : g.fromId);
</script>

<template>
  <div class="space-y-6">
    <section v-for="section in ([['Direct relationships', groups.direct], ['Further hops', groups.further]] as const)" :key="section[0]">
      <template v-if="section[1].length">
        <h3 class="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">{{ section[0] }} ({{ section[1].length }})</h3>
        <ul class="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          <li v-for="g in section[1]" :key="g.key" class="p-3" :data-testid="`rel-${g.type}`">
            <!-- Original direction is always kept: from — type → to -->
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <template v-for="(id, i) in [g.fromId, g.toId]" :key="id + i">
                <span v-if="i === 1" class="text-sm text-slate-500" :class="g.allRetracted ? 'line-through' : ''">— {{ relLabel(g.type) }} →</span>
                <span v-if="id === rootId" class="font-semibold">{{ name(id) }}</span>
                <RouterLink v-else :to="entityLink(id, rootId, route.query)" class="font-medium text-blue-700 hover:underline">{{ name(id) }}</RouterLink>
                <TypeBadge v-if="id !== rootId && nodeById.get(id)" :type="nodeById.get(id)!.type" />
              </template>
              <span v-if="g.claims.length > 1" class="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{{ g.claims.length }} separate claims</span>
            </div>
            <ul class="mt-2 space-y-2 border-l-2 border-slate-100 pl-3">
              <li v-for="c in g.claims" :key="c.id"><ClaimDetails :claim="c" /></li>
            </ul>
          </li>
        </ul>
      </template>
    </section>
    <p v-if="!groups.direct.length && !groups.further.length" class="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
      No relationships to show with the current filters.
    </p>
  </div>
</template>
