<script setup lang="ts">
import { ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { entityName } from '../api/client';
import { breadcrumbLink, readString, readTrail, searchLink } from '../lib/navigation';

defineProps<{ currentName: string }>();
const route = useRoute();
const names = ref<string[]>([]);

watch(
  () => route.query.trail,
  async () => {
    const trail = readTrail(route.query);
    names.value = trail.map(() => '…');
    const resolved = await Promise.all(trail.map((id) => entityName(id)));
    names.value = resolved;
  },
  { immediate: true },
);
</script>

<template>
  <nav aria-label="Breadcrumb" class="text-sm text-slate-600">
    <ol class="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <li>
        <RouterLink :to="searchLink(route.query)" class="text-blue-700 hover:underline">
          Search<span v-if="readString(route.query, 'q')" class="text-slate-500"> “{{ readString(route.query, 'q') }}”</span>
        </RouterLink>
      </li>
      <template v-for="(name, i) in names" :key="i">
        <li aria-hidden="true" class="text-slate-400">›</li>
        <li>
          <RouterLink :to="breadcrumbLink(i, route.query)" class="text-blue-700 hover:underline">{{ name }}</RouterLink>
        </li>
      </template>
      <li aria-hidden="true" class="text-slate-400">›</li>
      <li aria-current="page" class="font-medium text-slate-900">{{ currentName }}</li>
    </ol>
  </nav>
</template>
