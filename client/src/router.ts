import { createRouter, createWebHistory } from 'vue-router';
import SearchView from './views/SearchView.vue';
import EntityView from './views/EntityView.vue';

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (to, from, saved) => saved ?? (to.path !== from.path ? { top: 0 } : undefined),
  routes: [
    { path: '/', name: 'search', component: SearchView },
    { path: '/entities/:id', name: 'entity', component: EntityView, props: true },
  ],
});

// Entity pages set their own title once loaded; everything else uses the app title.
router.afterEach((to) => {
  if (to.name !== 'entity') document.title = 'Atlas · Threat Intel Search';
});
