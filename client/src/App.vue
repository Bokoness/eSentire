<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>

<template>
  <header class="border-b border-slate-200 bg-white">
    <div class="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
      <RouterLink to="/" class="font-semibold tracking-tight">Atlas</RouterLink>
      <span class="text-sm text-slate-500">Threat Intelligence Search &amp; Explore</span>
    </div>
  </header>
  <main class="mx-auto max-w-6xl px-4 py-6">
    <RouterView />
  </main>
</template>
