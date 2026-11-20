<script setup lang="ts">
import { computed } from 'vue';
import { typeColor, typeLabel } from '../lib/format';

const props = defineProps<{ type: string }>();
const color = computed(() => typeColor(props.type));
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap"
    :style="{ borderColor: color, color }"
  >
    <span class="h-1.5 w-1.5 rounded-full" :style="{ backgroundColor: color }" />
    {{ typeLabel(type) }}
  </span>
</template>
