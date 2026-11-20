<script setup lang="ts">
import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { GraphEdge, GraphNode } from '../api/types';
import { groupClaims, type ClaimGroup } from '../lib/claims';
import { relLabel, typeColor, typeLabel } from '../lib/format';
import ClaimDetails from './ClaimDetails.vue';

// Renders the SAME nodes/edges the relationship list uses (one API response, no graph endpoint).
const props = defineProps<{ rootId: string; nodes: GraphNode[]; edges: GraphEdge[] }>();
const emit = defineEmits<{ open: [id: string] }>();

const container = ref<HTMLDivElement | null>(null);
const selected = ref<ClaimGroup | null>(null);
let cy: Core | null = null;
const EDGE_LABEL_LIMIT = 20;
const MIN_READABLE_ZOOM = 0.75;

const groups = computed(() => groupClaims(props.edges));
const nodeById = computed(() => new Map(props.nodes.map((n) => [n.id, n])));
const legend = computed(() => [...new Set(props.nodes.map((n) => n.type))].sort());
const name = (id: string) => nodeById.value.get(id)?.name ?? 'Unknown';

function elements(): ElementDefinition[] {
  const nodes: ElementDefinition[] = props.nodes.map((n) => ({
    data: { id: n.id, label: n.name, color: typeColor(n.type), hop: n.hop, isRoot: n.id === props.rootId ? 1 : 0 },
  }));
  const edges: ElementDefinition[] = groups.value.map((g) => ({
    data: {
      id: g.key,
      source: g.fromId,
      target: g.toId,
      label: g.claims.length > 1 ? `${relLabel(g.type)} ×${g.claims.length}` : relLabel(g.type),
      retracted: g.allRetracted ? 1 : 0,
    },
  }));
  return [...nodes, ...edges];
}

function render() {
  if (!container.value) return;
  cy?.destroy();
  selected.value = null;
  const maxHop = Math.max(0, ...props.nodes.map((n) => n.hop));
  cy = cytoscape({
    container: container.value,
    elements: elements(),
    minZoom: 0.2,
    maxZoom: 3,
    // Performance on dense graphs / HiDPI screens: render at 1x and pan/zoom a cached texture
    // instead of redrawing every label on each wheel tick.
    pixelRatio: 1,
    textureOnViewport: true,
    motionBlur: false,
    // The default wheel step (~5% per notch) felt sluggish; ~13% per notch.
    wheelSensitivity: 2.5,
    style: [
      {
        selector: 'node',
        style: {
          'background-color': 'data(color)',
          label: 'data(label)',
          'font-size': 11,
          color: '#0f172a',
          'text-valign': 'bottom',
          'text-margin-y': 5,
          'text-wrap': 'ellipsis',
          'text-max-width': '110px',
          // Opaque label background so lines passing behind a name never make it unreadable.
          'text-background-color': '#ffffff',
          'text-background-opacity': 0.9,
          'text-background-padding': '2px',
          'text-background-shape': 'roundrectangle',
          width: 18,
          height: 18,
          'border-width': 1,
          'border-color': '#ffffff',
          'z-index': 10,
        },
      },
      {
        selector: 'node[isRoot = 1]',
        style: { width: 32, height: 32, 'border-width': 4, 'border-color': '#0f172a', 'font-size': 12, 'font-weight': 'bold', 'z-index': 20 },
      },
      {
        selector: 'edge',
        style: {
          width: 2,
          'line-color': '#94a3b8',
          'target-arrow-color': '#94a3b8',
          'target-arrow-shape': 'triangle',
          'arrow-scale': 0.8,
          'curve-style': 'bezier',
          'font-size': 9,
          color: '#475569',
          'text-rotation': 'autorotate',
          'text-background-color': '#ffffff',
          'text-background-opacity': 0.9,
          'text-background-padding': '2px',
          'z-index': 1,
        },
      },
      // Relationship labels are always visible on small graphs; on dense ones only on hover/selection,
      // otherwise dozens of labels pile on top of each other.
      { selector: 'edge.labelled, edge.hover, edge:selected', style: { label: 'data(label)' } },
      { selector: 'edge.hover', style: { width: 3, 'line-color': '#64748b', 'target-arrow-color': '#64748b', 'z-index': 5 } },
      // A line whose every claim is retracted is drawn dashed and faded — never like an active link.
      { selector: 'edge[retracted = 1]', style: { 'line-style': 'dashed', opacity: 0.45, 'line-color': '#dc2626', 'target-arrow-color': '#dc2626' } },
      { selector: 'edge:selected', style: { width: 3, 'line-color': '#1d4ed8', 'target-arrow-color': '#1d4ed8' } },
    ],
    layout: {
      name: 'concentric',
      concentric: (node: cytoscape.NodeSingular) => maxHop - Number(node.data('hop')),
      levelWidth: () => 1,
      // Reserve room for the label, not just the dot, so names on the same ring do not collide.
      nodeDimensionsIncludeLabels: true,
      minNodeSpacing: 30,
      spacingFactor: 1.15,
      padding: 30,
      animate: false,
    },
  });

  if (groups.value.length <= EDGE_LABEL_LIMIT) cy.edges().addClass('labelled');
  initialView();
  cy.on('mouseover', 'edge', (evt) => evt.target.addClass('hover'));
  cy.on('mouseout', 'edge', (evt) => evt.target.removeClass('hover'));

  cy.on('tap', 'node', (evt) => emit('open', evt.target.id()));
  cy.on('tap', 'edge', (evt) => {
    selected.value = groups.value.find((g) => g.key === evt.target.id()) ?? null;
  });
  cy.on('tap', (evt) => {
    if (evt.target === cy) selected.value = null;
  });
}

/** Fit everything (labels included) and avoid blowing a tiny neighbourhood up to giant dots. */
function fitView() {
  if (!cy) return;
  cy.fit(undefined, 30);
  if (cy.zoom() > 1.4) {
    cy.zoom(1.4);
    cy.center();
  }
}

/**
 * First view: fit if the labels stay readable; on dense graphs keep a readable zoom centred on the
 * current entity instead (pan/zoom or "Fit" shows the rest).
 */
function initialView() {
  if (!cy) return;
  fitView();
  if (cy.zoom() < MIN_READABLE_ZOOM) {
    cy.zoom(MIN_READABLE_ZOOM);
    cy.center(cy.getElementById(props.rootId));
  }
}

onMounted(render);
watch(() => [props.nodes, props.edges, props.rootId], render);
onBeforeUnmount(() => cy?.destroy());

defineExpose({ fit: fitView });
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[1fr_320px]">
    <div class="relative rounded-lg border border-slate-200 bg-white">
      <div ref="container" class="h-[360px] w-full sm:h-[480px]" data-testid="graph-canvas" />
      <button type="button" class="absolute top-2 right-2 rounded border border-slate-300 bg-white px-2 py-1 text-xs shadow-sm hover:bg-slate-50" @click="fitView">
        Fit
      </button>
      <div class="flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
        <span v-for="t in legend" :key="t" class="inline-flex items-center gap-1">
          <span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: typeColor(t) }" />{{ typeLabel(t) }}
        </span>
        <span class="inline-flex items-center gap-1"><span class="w-5 border-t-2 border-dashed border-red-500" />all claims retracted</span>
        <span class="inline-flex items-center gap-1"><span class="h-3 w-3 rounded-full border-[3px] border-slate-900" />current entity</span>
      </div>
    </div>

    <aside class="rounded-lg border border-slate-200 bg-white p-3 text-sm" aria-live="polite">
      <template v-if="selected">
        <h4 class="font-semibold">{{ name(selected.fromId) }} — {{ relLabel(selected.type) }} → {{ name(selected.toId) }}</h4>
        <p class="mb-2 text-xs text-slate-500">{{ selected.claims.length }} claim{{ selected.claims.length > 1 ? 's' : '' }} from the sources below. Each is shown separately.</p>
        <ul class="space-y-3">
          <li v-for="c in selected.claims" :key="c.id" class="border-t border-slate-100 pt-2"><ClaimDetails :claim="c" /></li>
        </ul>
      </template>
      <template v-else>
        <p class="text-slate-600">Click a node to open that entity. Click a line to see every claim, source and confidence behind it.</p>
        <p class="mt-2 text-xs text-slate-500">
          Rings show hops from the current entity. Two entities linked through a shared neighbour (for example the same CVE or IP) are
          <strong>not</strong> shown as directly related; only claims in the data become lines.
        </p>
      </template>
    </aside>
  </div>
</template>
