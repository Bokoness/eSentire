<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError, api, rememberName } from '../api/client';
import type { EntityDetail, RelationshipGraph as Graph } from '../api/types';
import Breadcrumbs from '../components/Breadcrumbs.vue';
import RelationshipGraph from '../components/RelationshipGraph.vue';
import RelationshipList from '../components/RelationshipList.vue';
import TypeBadge from '../components/TypeBadge.vue';
import { isWeak } from '../lib/claims';
import { attributeLabel, formatAttribute, relLabel } from '../lib/format';
import { entityLink, readString } from '../lib/navigation';

const props = defineProps<{ id: string }>();
const route = useRoute();
const router = useRouter();

const entity = ref<EntityDetail | null>(null);
const graph = ref<Graph | null>(null);
const entityError = ref<{ status: number; message: string } | null>(null);
const graphError = ref<string | null>(null);
const loadingGraph = ref(false);
const view = ref<'list' | 'graph'>('list');
const hideWeak = ref(false);

// View settings live in the URL with the trail, so a shared link reproduces the same view.
const depth = computed(() => {
  const d = Number(readString(route.query, 'depth'));
  return d >= 1 && d <= 3 ? d : 1;
});
const includeRetracted = computed(() => readString(route.query, 'retracted') !== '0');

function setQuery(patch: Record<string, string | undefined>) {
  const query = { ...route.query, ...patch };
  for (const k of Object.keys(query)) if (query[k] === undefined) delete query[k];
  void router.replace({ query });
}

let entityCtl: AbortController | null = null;
let graphCtl: AbortController | null = null;

async function loadEntity() {
  entityCtl?.abort();
  entityCtl = new AbortController();
  entity.value = null;
  entityError.value = null;
  try {
    entity.value = await api.entity(props.id, entityCtl.signal);
    rememberName(entity.value.id, entity.value.name);
    document.title = `${entity.value.name} · Atlas`;
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    entityError.value = { status: err instanceof ApiError ? err.status : 0, message: (err as Error).message };
  }
}

async function loadGraph() {
  graphCtl?.abort();
  graphCtl = new AbortController();
  loadingGraph.value = true;
  graphError.value = null;
  try {
    graph.value = await api.relationships(props.id, { depth: depth.value, includeRetracted: includeRetracted.value }, graphCtl.signal);
    graph.value.nodes.forEach((n) => rememberName(n.id, n.name));
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    graphError.value = (err as Error).message;
  } finally {
    loadingGraph.value = false;
  }
}

watch(() => props.id, loadEntity, { immediate: true });
watch(() => [props.id, depth.value, includeRetracted.value], loadGraph, { immediate: true });
onBeforeUnmount(() => {
  entityCtl?.abort();
  graphCtl?.abort();
});

const visibleEdges = computed(() => (graph.value ? graph.value.edges.filter((e) => !(hideWeak.value && isWeak(e))) : []));
const weakCount = computed(() => (graph.value ? graph.value.edges.filter(isWeak).length : 0));
const retractedShown = computed(() => (graph.value ? graph.value.edges.filter((e) => e.status === 'retracted').length : 0));

function openEntity(targetId: string) {
  if (targetId === props.id) return;
  void router.push(entityLink(targetId, props.id, route.query));
}

const attributeEntries = computed(() => (entity.value ? Object.entries(entity.value.attributes) : []));
</script>

<template>
  <div v-if="entityError" class="space-y-3">
    <Breadcrumbs current-name="Not found" />
    <div class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800" role="alert">
      {{ entityError.status === 404 ? 'This entity does not exist (it may have been removed in a later import).' : `Could not load entity: ${entityError.message}` }}
    </div>
  </div>

  <div v-else-if="!entity" class="text-slate-600">Loading entity…</div>

  <article v-else class="space-y-6">
    <Breadcrumbs :current-name="entity.name" />

    <header class="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="text-2xl font-semibold tracking-tight">{{ entity.name }}</h1>
        <TypeBadge :type="entity.type" />
        <span v-if="entity.isLegacy" class="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900" title="Imported from the legacy feed format">Legacy record</span>
        <span class="ml-auto font-mono text-xs text-slate-400">{{ entity.externalId }}</span>
      </div>
      <p v-if="entity.description" class="text-slate-700">{{ entity.description }}</p>
      <div v-if="entity.aliases.length" class="flex flex-wrap items-center gap-1.5 text-sm">
        <span class="text-slate-500">Also known as:</span>
        <span v-for="a in entity.aliases" :key="a" class="rounded-full bg-slate-100 px-2 py-0.5 text-slate-800">{{ a }}</span>
      </div>

      <dl class="grid gap-x-6 gap-y-1 pt-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="[key, value] in attributeEntries" :key="key" class="flex gap-2">
          <dt class="text-slate-500">{{ attributeLabel(key) }}:</dt>
          <dd class="text-slate-900">{{ formatAttribute(value) }}</dd>
        </div>
      </dl>

      <p v-if="entity.recordConfidence !== null || entity.recordSources.length" class="border-t border-slate-100 pt-2 text-xs text-slate-600">
        Record-level assessment (about this entity record, not about any relationship):
        <template v-if="entity.recordConfidence !== null"> confidence <strong>{{ entity.recordConfidence }}</strong></template>
        <template v-if="entity.recordSources.length">
          · sources {{ entity.recordSources.map((s) => `${s.name}${s.reliability ? ` (${s.reliability})` : ''}`).join(', ') }}
        </template>
      </p>
    </header>

    <section v-if="entity.unresolvedClaims.length" class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <h2 class="font-semibold">Claims that reference entities not in this dataset</h2>
      <ul class="mt-1 list-disc pl-5">
        <li v-for="u in entity.unresolvedClaims" :key="u.recordId + u.reference">
          <template v-if="u.direction === 'outgoing'">{{ entity.name }} — {{ relLabel(u.relationshipType ?? '') }} → “{{ u.reference }}”</template>
          <template v-else>“{{ u.reference }}” — {{ relLabel(u.relationshipType ?? '') }} → {{ entity.name }}</template>
          <span class="text-amber-700"> ({{ u.recordId }}, {{ u.issueType === 'ambiguous_reference' ? 'ambiguous' : 'not found' }}, not linked)</span>
        </li>
      </ul>
    </section>

    <section class="space-y-3">
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="text-lg font-semibold">Relationships</h2>
        <div class="inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm" role="tablist">
          <button
            v-for="v in (['list', 'graph'] as const)"
            :key="v"
            type="button"
            role="tab"
            :aria-selected="view === v"
            class="px-3 py-1"
            :class="view === v ? 'bg-slate-900 text-white' : 'bg-white hover:bg-slate-50'"
            @click="view = v"
          >
            {{ v === 'list' ? 'List' : 'Graph' }}
          </button>
        </div>
        <label class="flex items-center gap-1 text-sm">
          Depth
          <select :value="depth" class="rounded border border-slate-300 bg-white px-2 py-1" @change="setQuery({ depth: ($event.target as HTMLSelectElement).value === '1' ? undefined : ($event.target as HTMLSelectElement).value })">
            <option v-for="d in [1, 2, 3]" :key="d" :value="d">{{ d }} hop{{ d > 1 ? 's' : '' }}</option>
          </select>
        </label>
        <label class="flex items-center gap-1 text-sm">
          <input type="checkbox" :checked="includeRetracted" @change="setQuery({ retracted: ($event.target as HTMLInputElement).checked ? undefined : '0' })" />
          Show retracted
        </label>
        <label class="flex items-center gap-1 text-sm">
          <input v-model="hideWeak" type="checkbox" />
          Hide low / suspected
        </label>
      </div>

      <div class="flex flex-wrap gap-2 text-xs" aria-live="polite">
        <span v-if="loadingGraph" class="text-slate-500">Loading relationships…</span>
        <template v-else-if="graph">
          <span class="text-slate-600">{{ graph.nodes.length - 1 }} related entities · {{ graph.edges.length }} claims</span>
          <span v-if="graph.truncated" class="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">
            Partial result: limited to {{ graph.limits.maxNodes }} entities / {{ graph.limits.maxEdges }} claims. Lower the depth or open a neighbour to see more.
          </span>
          <span v-if="!includeRetracted && graph.hiddenRetractedCount" class="rounded bg-red-50 px-1.5 py-0.5 text-red-800">
            {{ graph.hiddenRetractedCount }} retracted claim{{ graph.hiddenRetractedCount > 1 ? 's' : '' }} hidden
          </span>
          <span v-if="includeRetracted && retractedShown" class="rounded bg-red-50 px-1.5 py-0.5 text-red-800">{{ retractedShown }} retracted claim{{ retractedShown > 1 ? 's' : '' }} shown (struck through)</span>
          <span v-if="hideWeak && weakCount" class="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{{ weakCount }} low/suspected claim{{ weakCount > 1 ? 's' : '' }} hidden</span>
        </template>
      </div>

      <div v-if="graphError" class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
        Could not load relationships: {{ graphError }} <button type="button" class="underline" @click="loadGraph">Retry</button>
      </div>
      <template v-else-if="graph && graph.rootId === id">
        <RelationshipList v-if="view === 'list'" :root-id="id" :nodes="graph.nodes" :edges="visibleEdges" />
        <RelationshipGraph v-else :root-id="id" :nodes="graph.nodes" :edges="visibleEdges" @open="openEntity" />
      </template>
    </section>
  </article>
</template>
