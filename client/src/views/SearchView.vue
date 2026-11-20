<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { api, rememberName } from '../api/client';
import { ENTITY_TYPES, type SearchResponse } from '../api/types';
import TypeBadge from '../components/TypeBadge.vue';
import { MATCH_LABELS, ORIGIN_COUNTRIES, typeLabel } from '../lib/format';
import { entityLink, readString } from '../lib/navigation';

const PAGE_SIZE = 20;
const route = useRoute();
const router = useRouter();

// The URL is the single source of truth for the search, so refresh/back/share all work.
const q = computed(() => readString(route.query, 'q'));
const type = computed(() => readString(route.query, 'type'));
const origin = computed(() => readString(route.query, 'origin'));
const page = computed(() => Math.max(1, Number(readString(route.query, 'page')) || 1));

const input = ref(q.value);
const data = ref<SearchResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
let controller: AbortController | null = null;
let debounce: ReturnType<typeof setTimeout> | undefined;

const originEnabled = computed(() => type.value === '' || type.value === 'threat_actor');
const totalPages = computed(() => (data.value ? Math.max(1, Math.ceil(data.value.total / data.value.limit)) : 1));

function updateQuery(patch: Record<string, string | undefined>) {
  const next: Record<string, string> = {};
  const merged = { q: q.value, type: type.value, origin: origin.value, page: String(page.value), ...patch };
  for (const [k, v] of Object.entries(merged)) if (v && !(k === 'page' && v === '1')) next[k] = v;
  void router.replace({ name: 'search', query: next });
}

watch(input, (value) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    if (value.trim() !== q.value) updateQuery({ q: value.trim(), page: undefined });
  }, 300);
});
watch(q, (value) => {
  if (value !== input.value.trim()) input.value = value;
});

async function load() {
  controller?.abort();
  controller = new AbortController();
  loading.value = true;
  error.value = null;
  try {
    const res = await api.search(
      {
        q: q.value,
        type: type.value || undefined,
        origin_country: originEnabled.value ? origin.value || undefined : undefined,
        page: page.value,
        limit: PAGE_SIZE,
      },
      controller.signal,
    );
    data.value = res;
    res.results.forEach((r) => rememberName(r.id, r.name));
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    error.value = (err as Error).message || 'Search failed';
  } finally {
    loading.value = false;
  }
}

watch(() => [q.value, type.value, origin.value, page.value], load, { immediate: true });
onBeforeUnmount(() => {
  controller?.abort();
  clearTimeout(debounce);
});
</script>

<template>
  <section class="space-y-4">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Search threat intelligence</h1>
      <p class="text-sm text-slate-600">Search names, aliases and descriptions. Shared aliases show every matching entity.</p>
    </div>

    <form class="grid gap-2 sm:grid-cols-[1fr_auto_auto]" role="search" @submit.prevent="updateQuery({ q: input.trim(), page: undefined })">
      <label class="sr-only" for="q">Search</label>
      <input
        id="q"
        v-model="input"
        type="search"
        autocomplete="off"
        placeholder="e.g. Cozy Bear, Log4Shell, CVE-2023-23397, espionage"
        class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
      />
      <label class="sr-only" for="type">Entity type</label>
      <select
        id="type"
        :value="type"
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        @change="updateQuery({ type: ($event.target as HTMLSelectElement).value || undefined, page: undefined })"
      >
        <option value="">All types</option>
        <option v-for="t in ENTITY_TYPES" :key="t" :value="t">{{ typeLabel(t) }}</option>
      </select>
      <label class="sr-only" for="origin">Origin country (threat actors)</label>
      <select
        id="origin"
        :value="origin"
        :disabled="!originEnabled"
        :title="originEnabled ? 'Origin country (threat actors only)' : 'Origin applies to threat actors only'"
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
        @change="updateQuery({ origin: ($event.target as HTMLSelectElement).value || undefined, page: undefined })"
      >
        <option value="">Any origin</option>
        <option v-for="c in ORIGIN_COUNTRIES" :key="c.code" :value="c.code">{{ c.label }}</option>
      </select>
    </form>

    <div class="flex items-center justify-between text-sm text-slate-600" aria-live="polite">
      <span v-if="loading">Searching…</span>
      <span v-else-if="data">
        {{ data.total }} result{{ data.total === 1 ? '' : 's' }}<template v-if="!q"> · showing all entities</template>
        <template v-if="origin && originEnabled"> · origin {{ origin }} (threat actors only)</template>
      </span>
    </div>

    <div v-if="error" class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
      Could not load results: {{ error }}
      <button type="button" class="ml-2 underline" @click="load">Retry</button>
    </div>

    <p v-else-if="data && !data.results.length && !loading" class="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">
      No entities match <strong v-if="q">“{{ q }}”</strong> with these filters.
    </p>

    <ul v-else-if="data" class="space-y-2" :class="loading ? 'opacity-60' : ''">
      <li v-for="r in data.results" :key="r.id">
        <RouterLink
          :to="entityLink(r.id, null, route.query)"
          class="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-blue-300 hover:shadow"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-semibold text-slate-900">{{ r.name }}</span>
            <TypeBadge :type="r.type" />
            <span v-if="r.keyFact" class="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{{ r.keyFact.label }}: {{ r.keyFact.value }}</span>
            <span class="ml-auto font-mono text-xs text-slate-400">{{ r.externalId }}</span>
          </div>
          <p v-if="r.description" class="mt-1 text-sm text-slate-600">{{ r.description }}</p>
          <p v-if="r.matchedOn" class="mt-1 text-xs text-slate-500">
            <span class="font-medium text-slate-700">{{ MATCH_LABELS[r.matchedOn] }}</span>
            <template v-if="r.matchedOn !== 'exact_name'">: <q>{{ r.matchedValue }}</q></template>
            <span class="text-slate-400"> · relevance {{ r.score }}</span>
          </p>
        </RouterLink>
      </li>
    </ul>

    <nav v-if="data && totalPages > 1" class="flex items-center justify-center gap-3 text-sm" aria-label="Pagination">
      <button type="button" class="rounded border border-slate-300 bg-white px-3 py-1 disabled:opacity-40" :disabled="page <= 1" @click="updateQuery({ page: String(page - 1) })">
        Previous
      </button>
      <span>Page {{ page }} of {{ totalPages }}</span>
      <button type="button" class="rounded border border-slate-300 bg-white px-3 py-1 disabled:opacity-40" :disabled="page >= totalPages" @click="updateQuery({ page: String(page + 1) })">
        Next
      </button>
    </nav>
  </section>
</template>
