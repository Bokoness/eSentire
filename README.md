# Atlas — Threat Intelligence Search & Explore

A small web app for a security analyst to **search** threat-intelligence entities (by name, alias or description),
open an entity, see its **claims with confidence, status and source**, and **follow connections** (1–3 hops) without
losing the investigation trail. The single stretch goal is an **interactive graph** of the neighbourhood.

> **The seed data (`data/intel.json`) is synthetic and illustrative.** It is not authoritative intelligence.
> Attributions are simplified and confidence values are invented by the exercise authors.

---

## 1. Quick start

### Option A — everything in Docker (one command)

**Prerequisites:** Docker with Compose v2. No local Node.js needed.

```bash
docker compose up --build
```

Then open **http://localhost:8080**. This single command:

1. starts **PostgreSQL** (`postgres`, host port 5433) and creates the `atlas` and `atlas_test` databases;
2. builds and starts the **API** (`api`): on every start it runs `prisma migrate deploy`, ingests `data/intel.json`
   (idempotent, so restarts never duplicate data; the ingestion report is in `docker compose logs api`) and serves the REST API;
3. builds the **UI** (`web`): the production Vue build served by nginx, which proxies `/api` to the API container and
   falls back to `index.html` for deep links such as `/entities/<id>`.

Start order is enforced with health checks (database ready → API seeded and answering `/api/health` → web).
The API is reachable through the UI origin, e.g. `curl "http://localhost:8080/api/entities/search?q=cozy%20bear"`.

**Port already in use?** The host ports are configurable (defaults: UI 8080, Postgres 5433):

```bash
ATLAS_WEB_PORT=9090 ATLAS_DB_PORT=5434 docker compose up --build
```

The containers talk to each other on the internal Docker network, so changing host ports needs no other change.
(For Option B, also change the port in `server/.env`.)

| Command | What it does |
|---|---|
| `docker compose up --build` (= `npm run docker:up`) | build + start all three services in the foreground |
| `docker compose up --build -d --wait` | same, in the background, returns once everything is healthy |
| `docker compose logs api` | ingestion report and API logs |
| `docker compose down` (= `npm run docker:down`) | stop everything, keep the data |
| `docker compose down -v` | stop and delete the database volume (next start re-creates and re-seeds it; entity UUIDs change, so old links break) |

Files: [`docker-compose.yml`](docker-compose.yml), [`server/Dockerfile`](server/Dockerfile),
[`client/Dockerfile`](client/Dockerfile), [`client/docker/nginx.conf`](client/docker/nginx.conf).

### Option B — local development (hot reload)

**Prerequisites:** Node.js ≥ 20 (tested on 24), npm ≥ 10, Docker with Compose (only for Postgres).

```bash
npm install            # installs server + client (npm workspaces)
npm run setup          # creates server/.env, starts ONLY the postgres service, generates Prisma client, migrates, ingests the seed
npm run dev            # API on :3001 + UI on http://localhost:5173 (Vite proxies /api to Express)
```

Both options share the same `postgres` service and data volume. If the Docker stack is running, stop the `api` and
`web` containers (`docker compose stop api web`) before `npm run dev`, or simply run both: they use different ports
(8080 vs 5173/3001).

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Applies migrations to the separate `atlas_test` DB, then runs all Jest suites (unit + Supertest + Postgres integration) |
| `npm run typecheck` | `tsc --noEmit` (server) and `vue-tsc --noEmit` (client) |
| `npm run seed` | Re-runs ingestion (idempotent) and prints the ingestion report |
| `npm run build` | Compiles the server and builds the client |
| `npm run db:down` | Stops Postgres |

Postgres runs in Docker on **host port 5433** (to avoid clashing with a local 5432). Dev-only credentials live in
`server/.env.example`; no secrets are committed. The API reads `API_PORT` (not `PORT`, which many tools set for the frontend).

---

## 2. Architecture

```
data/intel.json ──► Ingestion CLI ──► PostgreSQL ◄── Express REST API ◄── Vite proxy (dev) / nginx (Docker) ◄── Vue 3 UI (+ Cytoscape graph)
```

In Docker the three services are `postgres`, `api` (Express; runs migrations and ingestion on start) and `web`
(nginx serving the built UI and proxying `/api`). The browser only talks to one origin in both setups, so no CORS is needed.

| Layer | Tech | Where |
|---|---|---|
| UI | Vue 3, TypeScript, Vite, Vue Router, Tailwind CSS, Cytoscape.js | `client/src` |
| API | Express 5 + TypeScript, zod validation | `server/src/routes` (HTTP + validation only) |
| Logic | search, BFS traversal, confidence view | `server/src/services` |
| Data access | Prisma 6 + parameterised raw SQL for ranking | `server/src/repositories` |
| Ingestion | pure "plan" step + transactional writer + CLI | `server/src/ingestion` |
| Tests | Jest, ts-jest, Supertest, real Postgres | `server/tests` |

**Why relational (PostgreSQL)?** The data is a small, typed graph where each edge carries rich, uneven metadata
(source, confidence, status, dates). Postgres gives foreign keys, unique constraints for idempotent ingestion,
JSONB for the uneven parts, and simple indexed lookups. A 1–3 hop neighbourhood is three indexed queries. A graph
database, Elasticsearch or a cache would add operational cost without a measured need at this size (see §8).

**Why Prisma 6 (not 7/8)?** Its CommonJS client works with `ts-jest` without ESM configuration or driver adapters,
which keeps the setup small and explainable.

---

## 3. Data model

Five tables (`server/prisma/schema.prisma`):

| Table | Purpose | Key points |
|---|---|---|
| `entities` | actors, CVEs, campaigns, malware, tools, software, sectors, infrastructure | internal UUID PK; `externalId` unique; `attributes` JSONB for type-specific facts (cvss, published, origin_country, `kind`=ip/domain, record-level confidence/sources); `raw` JSONB keeps the original record |
| `aliases` | alternative names | **no global unique** (aliases really collide), but unique per entity on the normalised value |
| `sources` | reporting sources | `reliability` (A–F) describes the **source**, not any claim |
| `relationships` | **one row = one claim by one source** | `confidenceRaw` (as given), `confidenceScore` (only explicit numbers 0–1), `qualifier`, `status` (e.g. `retracted`), `asOfRaw` (verbatim), `evidence` + `derivation` for text-extracted claims, `raw` |
| `ingestion_issues` | what could not be ingested cleanly | unique on (`recordId`, `issueType`, `field`) so re-runs do not pile up |

`*Normalized` columns (lower-case, collapsed whitespace) power exact matching and indexed lookups; the UI always
shows the original text. Relationship types are stored as given (`uses` and `uses_tool` are not merged).

### Confidence vs. qualifier vs. status vs. source reliability

These are **different things** and are never collapsed into one number:

| Field | Meaning | Example |
|---|---|---|
| `confidence.strength` | how strongly the source rates it | `HIGH` → `high` |
| `confidence.assessment` | epistemic state the source declared | `CONFIRMED`, `reported`, `SUSPECTED` |
| `confidence.score` | a number the source gave | `0.85` |
| `status` | lifecycle of the claim | `retracted` |
| `source.reliability` | how much we trust the source in general | `A`…`F` |

Rules: `HIGH` is never shown as "confirmed"; `SUSPECTED` is never turned into a number; a missing value is shown as
**Unknown** (not as confirmed); absence of `status` does not mean "confirmed". Conflicting claims (e.g. SUNBURST
attributed to APT29 by a government advisory **and** to APT28 by an anonymous blog) are shown side by side, each
with its own source. We never compute an aggregate confidence.

### How low-confidence data is treated

It is **kept and shown, but labelled** — hiding it silently would hide the fact that someone claimed it:

- **Retracted** claims (`rel-091`) stay in the database and in the default view, struck through with a red badge;
  in the graph they are dashed and faded. "Show retracted" off re-queries the API with `includeRetracted=false`,
  which **recomputes reachability** (an entity reachable only via a retracted claim disappears) and reports
  `hiddenRetractedCount` so the UI can say how many were hidden.
- **E/F sources** get a separate "low-reliability source" warning on every claim.
- **"Hide low / suspected"** is an optional client-side display filter with a visible counter. It does not change
  traversal (documented trade-off: it is a reading aid, not a data filter).

### Aliases, collisions and why we never auto-merge

The seed contains real collisions: `HIDDEN COBRA` (Lazarus and legacy Kimsuky), `Dragonfly` (TA-0012 and TA-0013),
`Snake`/`Uroburos` (Turla and the malware), `Carbanak` (FIN7 and the malware), and `NotPetya` is both a campaign and a
malware name. `APT29` and the legacy record `Cozy Bear` (TA-0044) are kept as **two entities**; the `same_as` claim
between them is a claim with a source, not a merge instruction.

**Future merge (documented, not implemented):** add `mergedIntoId` on `entities`; a merge sets it on the losing
record, the API redirects its UUID to the survivor, and every original claim, alias and source is preserved so the
merge can be audited or undone.

---

## 4. Ingestion

`npm run seed` → `server/src/ingestion/cli.ts`. The pipeline is split into a **pure plan** (`plan.ts`, fully
unit-tested against the real file) and a **transactional writer** (`write.ts`).

1. Parse and validate; invalid records become `invalid_record` issues instead of crashing the run.
2. Normalise. Legacy records are detected by `ref` **and** `title` — not by `kind`, because infrastructure records
   also carry `kind: ip|domain` (kept in `attributes`). Legacy `kind=APT` → `threat_actor`; `also_known_as` is split on `;`.
   Dates, `cvss` (`"9.8"` stays a string) and unknown fields are preserved verbatim.
3. Upsert sources, entities and aliases (keyed by external id, so UUIDs are stable across re-imports).
4. Resolve relationship endpoints: **exact external id → exact primary name → exact alias** (case/whitespace-insensitive,
   never contains/prefix/fuzzy). Several candidates at one level → `ambiguous_reference`; none → `unresolved_reference`.
   *Name-before-alias is a technical precedence rule, not proof of identity.* Search is not limited by this rule.
5. Free-text extraction (below), then `temporal_anomaly` checks.
6. Write everything in one transaction; remove rows the current seed no longer produces (stale derived claims/issues).
7. Print a report.

Result on the provided seed (verified by tests):

```
Entities:       71/71 accepted (4 legacy)
Relationships:  89/91 accepted, 2 unresolved (rel-032 → "DarkSide", rel-080 → "TA505"), 0 ambiguous
Text-derived:   1 created, 15 sentences skipped (8 duplicates of structured claims, 7 no known target)
Issues:         2 unresolved_reference, 6 temporal_anomaly
```

No placeholder entities are created for DarkSide or TA505; the claims are listed on the source entity's page as
"references to entities not in this dataset". `TA505 (overlap)` is an alias of Cl0p but is **not** an exact match for `TA505`.

**Idempotency:** running the seed twice changes no row counts and no UUIDs (integration test).

### Free-text extraction

Deterministic and deliberately small (`extract.ts`): a few trigger phrases verified against the actual wording
(`exploiting X`, `exploitation of X`, `overlaps with X`, `attributed to X`, `used by X`, `used in X`,
`possibly the same as X` / `likely duplicate of X`). The text right after the trigger must start with a known name or
alias (longest match, word boundary), which is then resolved with the same exact resolver. Ambiguous targets are skipped.

- A new claim gets `evidence` (the sentence), `derivation` `{method, recordId, field, rule}` and the technical source
  `src-seed-text` (`type=derived`, no reliability). That source only says *where in the dataset* the text came from;
  it is not an independent intelligence source and is not shown as corroboration. No confidence is invented.
- Hedged phrases (`possibly`, `likely`) become at most `qualifier: suspected`.
- A sentence that restates an existing structured claim is skipped; for symmetric types (`same_as`, `overlaps_with`,
  `related_to`) the check ignores direction. Structured claims from different sources are **never** merged with each other.
- On this seed the only genuinely new fact is **LEMURLOOT — used_in → MOVEit mass exploitation** ("Web shell used in
  the MOVEit campaign."). Every skipped sentence and its reason is printed in the report.
- Relationship `note` fields are not mined (they have no subject entity).
- The PDF's analyst note ("same C2 patterns… possibly the same crew, possibly a copycat") does not identify a concrete
  incident or actor, so it is **not** turned into an entity or claim. No separate notes file was provided, so none was invented.

### Temporal anomalies

A non-blocking warning when an `exploits` claim's `as_of` lies entirely before the target vulnerability's `published`
date. Dates are parsed into ranges that keep their precision (`2023` = whole year, `Q3 2022` = quarter,
`March 2021` = month); the warning fires only if the **end** of the claim range is before the **start** of the
publication range. Ambiguous dates (`1/9/24`) are skipped. `affects` is not checked (a flaw affects a product before
disclosure). Possible explanations — a zero-day, or `as_of` being a report date — are why the claim is kept unchanged.
Flagged on the seed: rel-001, rel-008, rel-012, rel-024, rel-030, rel-091.

---

## 5. API

All endpoints return JSON. Validation errors → `400 {error, details[]}`; unknown ids → `404`; unexpected errors →
generic `500` (no stack traces or SQL leak to the client).

### `GET /api/entities/search`

| Param | Notes |
|---|---|
| `q` | optional (≤200 chars); empty = browse all, sorted by name |
| `type` | one of `threat_actor, vulnerability, campaign, malware, tool, software, sector, infrastructure` |
| `origin_country` | 2-letter code, case-insensitive (only threat actors carry it) |
| `page`, `limit` | default 1 / 20, `limit` ≤ 100 |

Relevance score (not confidence): exact name **100** > exact alias **90** > partial name **70** > partial alias **60** >
description **40**. One row per entity (its best match). User input is a bound parameter and LIKE wildcards
(`%`, `_`, `\`) are escaped.

```http
GET /api/entities/search?q=cozy%20bear
```
```json
{
  "query": { "q": "cozy bear", "type": null, "originCountry": null },
  "total": 2, "page": 1, "limit": 20,
  "results": [
    { "id": "1e5b…", "externalId": "TA-0044", "name": "Cozy Bear", "type": "threat_actor",
      "description": "Russian intelligence-linked group. (Imported from legacy feed; likely duplicate of APT29.)",
      "matchedOn": "exact_name", "matchedValue": "Cozy Bear", "score": 100,
      "keyFact": { "label": "First seen", "value": "2008" } },
    { "id": "31b8…", "externalId": "actor-apt29", "name": "APT29", "type": "threat_actor",
      "description": "Suspected state-sponsored espionage group. …",
      "matchedOn": "exact_alias", "matchedValue": "Cozy Bear", "score": 90,
      "keyFact": { "label": "Origin", "value": "RU" } }
  ]
}
```

### `GET /api/entities/:id`

Entity by internal UUID: name, type, description, aliases, display attributes, `isLegacy`, `keyFact`,
`recordConfidence` / `recordSources` (about the **record**, kept apart from claim confidence) and `unresolvedClaims`
(e.g. Colonial Pipeline → "DarkSide"). `raw` is stored but not returned.

### `GET /api/entities/:id/relationships?depth=1..3&includeRetracted=true|false`

BFS over incoming **and** outgoing claims, one query per hop for the whole frontier (no N+1), a visited set against
cycles, original direction preserved. Limits: **50 nodes / 150 claims**, stable order (hop, name, id), `truncated: true`
when anything was cut. The same response feeds the relationship list and the graph — there is no graph-only endpoint.

```http
GET /api/entities/{sandworm}/relationships?depth=1
```
```json
{
  "rootId": "14a7…", "depth": 1, "includeRetracted": true,
  "nodes": [ { "id": "14a7…", "name": "Sandworm", "type": "threat_actor", "hop": 0 }, "…" ],
  "edges": [ {
      "id": "ba06…", "externalId": "rel-091", "fromId": "14a7…", "toId": "5f17…", "type": "exploits",
      "confidence": { "raw": { "qualifier": "reported" }, "strength": null, "assessment": "reported", "score": null, "unknown": false },
      "qualifier": "reported", "status": "retracted", "note": "RETRACTED by source in later update", "asOf": "2021-03-15",
      "evidence": null, "derivation": null,
      "warnings": [ { "type": "temporal_anomaly", "message": "Claim dated 2021-03-15 precedes publication of CVE-2021-44228 (2021-12-10)" } ],
      "source": { "externalId": "src-blog", "name": "Anonymous security blog", "type": "osint", "reliability": "F", "lowReliability": true }
  }, "…" ],
  "truncated": false, "hiddenRetractedCount": 0, "limits": { "maxNodes": 50, "maxEdges": 150 }
}
```

---

## 6. UI

- **Search (`/`)** — 300 ms debounced input, type filter, origin filter (threat actors), ranked results showing name,
  type, a type-specific key fact (CVSS, origin, first seen, kind), a short description and *why it matched*
  ("Exact alias: Cozy Bear", "Description mentions: …"). Loading / empty / error states, pagination. A shared alias
  shows every entity that carries it.
- **Entity (`/entities/:id`)** — breadcrumbs (`Search "Cozy Bear" › APT29 › CVE-2021-44228 › APT41`), details, aliases,
  attributes, record-level assessment, unresolved references, and the relationships as a **list** or **graph**.
  Each claim shows direction, source + reliability, confidence axes (or Unknown), qualifier, status, date warnings,
  note and evidence. Several claims on the same pair are listed separately.
- **Graph** — Cytoscape.js, concentric rings by hop (label space reserved so names do not overlap), colour by type
  with a legend, highlighted root, pan/zoom/fit. Relationship labels are always shown on small graphs and on
  hover/selection on dense ones.
  Clicking a node navigates (trail kept); clicking a line lists **every** claim behind it. All-retracted lines are dashed red.
  A shared neighbour is never drawn as a direct link between two actors.
- **State in the URL** — `q/type/origin/page`, `trail` (UUIDs), `depth`, `retracted` — so refresh, back/forward and shared
  links reproduce the investigation. Revisiting an entity already in the trail cuts the trail back (no loops); the trail
  is capped at 10 entries. Layout is responsive (checked at 375 px with no horizontal scroll).

---

## 7. Tests

`npm test` → **12 suites, 102 tests**, all against the real seed and a real Postgres test database.

| Area | File |
|---|---|
| Normalisation (legacy vs `kind`, aliases, cvss string), confidence extraction | `tests/unit/normalize.test.ts` |
| Exact resolution, alias collisions, NotPetya ambiguity, TA505 vs `TA505 (overlap)` | `tests/unit/resolve.test.ts` |
| Date ranges, `temporal_anomaly` rules and the exact flagged set | `tests/unit/temporal.test.ts` |
| Text extraction: evidence, determinism, symmetric dedupe, ambiguity, real-seed output | `tests/unit/extract.test.ts` |
| Whole plan on intel.json: counts, unresolved, retracted, verbatim dates, independent claims | `tests/unit/plan.test.ts` |
| Confidence axes (HIGH ≠ confirmed, Unknown) | `tests/unit/confidence.test.ts` |
| BFS on an in-memory graph: in/out, depth 1–3, cycles, one query per hop, parallel claims, `includeRetracted`, truncation | `tests/unit/traversal.test.ts` |
| Postgres: counts, idempotent re-import with stable UUIDs, alias uniqueness, FK, indexes | `tests/integration/ingestion.int.test.ts` |
| Search API: ranking, Cozy Bear, collisions, description match, filters, pagination, wildcards/injection, 400s | `tests/integration/search.api.test.ts` |
| Entity API: details, record vs claim confidence, unresolved claims, 404/400 | `tests/integration/entity.api.test.ts` |
| Relationship API: direction, separate claims, confidence, warnings, retracted on/off, multi-hop, truncation, 400/404 | `tests/integration/relationships.api.test.ts` |

**Manual smoke test (done in a browser):** search "Cozy Bear" → both results with match reasons → APT29 → CVE-2021-44228
(Log4Shell) → APT41 → refresh (breadcrumbs survive) → breadcrumb back to APT29 → graph at depth 2 → click an edge
(claim panel with source, confidence, date warning) → click the APT41 node (navigates, trail kept). Also checked:
Sandworm with "Show retracted" off (Log4Shell disappears, "1 retracted claim hidden"), "Hide low / suspected",
type + origin filters, pagination, empty state, 404 page, Colonial Pipeline → DarkSide notice, 375 px mobile layout.
There are no automated browser (E2E) tests.

---

## 8. Assumptions, trade-offs, limitations

**Assumptions**
- Relationship direction is meaningful and is never inverted; traversal just walks both directions.
- `as_of` is when the claim was valid/reported, which may be a report date, so date anomalies only warn.
- Record-level `confidence`/`sources` on an entity describe the record, not its relationships.
- Only `APT` occurs as a legacy `kind`; other values are rejected as `invalid_record` rather than guessed.

**Trade-offs**
- Raw SQL for search ranking (one readable query with a `LATERAL` best-match) instead of several Prisma calls merged in JS.
- BFS in the service instead of a recursive CTE: easier to test with an in-memory repository and to cap early; it is
  still one query per hop.
- The origin-country list in the UI is a constant in one place (`client/src/lib/format.ts`); the API accepts any
  2-letter code. A `GET /api/entities/facets` derived from data is the planned replacement (not implemented).
- "Hide low / suspected" filters only the display; "Show retracted" changes the query. Retraction is a fact about a
  claim's validity, while low/suspected is a reading preference.

**Known limitations**
- Partial search is `ILIKE '%term%'`: no stemming, typo tolerance or ranking by recency/confidence (deliberately — that
  would be a second stretch goal).
- Text extraction covers a handful of phrasings; anything else is reported as skipped, not understood.
- Edges between two nodes that are both at the maximum depth are not fetched (the boundary of the requested depth).
- Graph layout is a simple built-in layout; dense depth-3 neighbourhoods get crowded (hence the 50/150 caps).
- No authentication, audit trail of edits, or merge workflow.
- The Docker `api` image keeps dev dependencies (the Prisma CLI is needed for `migrate deploy` at start) and seeds on
  every start. That is convenient for a demo; in production migrations and ingestion would be separate one-off jobs
  and the runtime image would be slimmer.
- The Docker setup runs the app, not the test suite; tests run locally (`npm test`) against the `atlas_test` database.

### Scaling (100× ≈ 7,100 entities, 9,100 relationships)

This is still small for Postgres; a new database is not needed. What breaks first:
1. **`%term%` search** cannot use B-tree indexes → measure with `EXPLAIN ANALYZE`, then add `pg_trgm` GIN indexes on
   `nameNormalized`, `aliases.valueNormalized` and `lower(description)`.
2. **Hub nodes** (Cobalt Strike, Government) explode multi-hop results → already capped (50/150, early stop); next step
   would be per-type fan-out limits or paging by hop.
3. **Ingestion** does row-by-row upserts in one transaction (fine for hundreds of rows) → batch with `createMany` /
   `INSERT … ON CONFLICT` and chunked transactions.
Caching and a graph database were left out: no measured latency problem, and they would add invalidation and
operational complexity to an MVP.

---

## 9. What I would do with more time

- `pg_trgm` indexes + measured search plans; facets endpoint for origin/motivation derived from data.
- Playwright E2E for the smoke path; component tests for the claim rendering rules.
- Analyst workflow: mark claims as reviewed, merge with `mergedIntoId` and audit trail.
- Source-aware views (e.g. "only A/B sources") computed server-side so they also affect reachability.
