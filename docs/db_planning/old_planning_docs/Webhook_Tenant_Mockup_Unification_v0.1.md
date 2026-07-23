# Webhook ↔ Tenant Mockup Unification v0.1

Status: context/handoff document. Sequencing decided and first execution step done 2026-07-21 (see "Sequencing — resolved" and "KB seed migration — done" below); written to let a fresh conversation pick this up without re-deriving the research below
Date: 2026-07-15, updated 2026-07-21
Source: live inspection of `webhook.js`, `src/fast_path/*.js`, `property_packages/demo/*.json`, `supabase_bridge/supabase_client.js`, cross-referenced with `docs/db_planning/Physical_Schema_v0.1.md`

## Why this document exists

While scoping a narrow fix (resolving `reservation_details.venue_id` at write-time — done, see `DB_Construction_Decisions_v0.1.md`), it became clear the webhook's guest-facing venue/menu matching is **not one system with a documented gap** — it's **three separate, non-cross-referenced systems already living inside the webhook**, none of which read from Supabase at all. Building "the runtime-package pipeline" (config tables → compiled package → webhook consumes) that was loosely scoped as future work is therefore not one task. This doc records exactly what exists today so that work can be scoped properly in a future session.

## The three disconnected venue/menu representations (confirmed by direct code trace)

1. **`KNOWN_RESERVATION_VENUES`** — `webhook.js:1393-1400`. A hardcoded array (`canonical` name + `aliases[]`) used only by `extractKnownReservationVenue()`/`extractSingleVenueFromReply()` (`webhook.js:1402-1442`) to parse free-text venue mentions during reservation conversations. This is what `supabase_bridge/supabase_client.js`'s `resolveVenueId()` matches against — see the venue_id fix.
2. **`property_master_data.json`'s `dining.venues[]`** — loaded via `loadPropertyPackage()` into `propertyData.propertyMasterData`, consumed only by `src/fast_path/fast_path_responder.js` (`getSelectableRestaurants`, `buildRestaurantList`, `resolveRestaurantByKey`) to render the "show me restaurants" list and resolve a selected venue by `menu_key`. Same 6 venues (+ excluded Room Service) as #1, but a completely separate data structure with its own fields (`menu_key`, `canonical_name`, `aliases`, `type`, `service_class`, `reservation_led`, etc. — this is the file the venue seed data for Supabase was sourced from).
3. **`menu_dictionary.json`'s menu tree** — loaded into `propertyData.menuDictionary`, consumed only by `src/fast_path/fast_path_classifier.js`'s `classifyFastPath()`. A denormalized tree keyed by context (`main_menu`, `restaurants_menu`, etc.), each with `options{}` and a flat `lookup{}`/`choice_aliases` map for matching guest input to a menu action.

**None of these three reference each other by ID.** They happen to agree today because someone kept them in sync by hand when the venue list was last updated. There is no structural link between "the venue a reservation was made for" (#1), "the venue shown in the restaurant list" (#2), and "the menu context a fast-path reply navigates to" (#3).

## Other confirmed findings

- **No build/compile step exists anywhere.** `package.json` has only `"start": "node webhook.js"`. No `build.js`/`compile.js`. Grep for `runtime_package`/`compile` across all `.js` files: zero hits.
- **The JSON files are re-read from disk on every relevant message, not cached.** `src/fast_path/property_loader.js`'s `safeRequireJson()` explicitly does `delete require.cache[...]` before every `require()` — this is a live disk read + parse on every fast-path turn, called from 4 separate sites in `webhook.js` (lines ~2910, 2981, 3426, 3937), each independently re-loading rather than sharing one cached object per request.
- **`fast_path_triggers.json` is dead code.** Nothing in the repo reads it — confirmed via repo-wide grep. The trigger-keyword concept it once held now lives inline inside `menu_dictionary.json`'s `lookup`/`choice_aliases` maps.
- **`response_templates_en.json`/`response_templates_es.json`/`response_templates.json`** are flat `{template_key: "string with {{placeholders}}"}` maps (~64-132 keys). Language is encoded by key-name suffix (`_en`/`_es`), not a `language` field. No `channel`, `approval_status`, or `required_variables` metadata — placeholders are implicit (discovered by reading the string), not declared. This is meaningfully simpler than the `response_templates` table already built in Supabase (`language`, `channel`, `approval_status`, `required_variables` columns).
- **Supabase's only current read from the webhook side** is the narrow `venues` FK lookup in `resolveVenueId()` (`supabase_bridge/supabase_client.js`) added for the venue_id fix — an exact-match lookup only, not a general config read. Confirmed via repo-wide grep: nothing reads `menu_branches`, `menu_options`, `menu_option_aliases`, `menu_branch_triggers`, `answer_boundaries`, `response_templates`, `reservation_rules`, `runtime_feature_flags`, `property_settings`, or `teams` from Supabase anywhere in the webhook or `src/`.
- **The Tenant Property Configuration Tool** (`Tenant_Property_Configuration_v0.2.html`, repo root) is a static HTML/CSS/JS mockup — state lives in browser `localStorage` only, zero backend, zero Supabase wiring, zero API calls. A UI hint string inside the file itself says *"This is the kind of structured data the webhook and LOGS could eventually read from Supabase"* — aspirational, not built.

## Sequencing — resolved 2026-07-21

The broader product framing, established this session: LOGS is the tenant-facing dashboard for triaging/assigning/tracking cases; the webhook captures guest intent; the Tenant Property Configuration Tool is where the knowledge base gets *authored*. The open question was how the tool's output becomes the webhook's source of truth. Three roughly-separable chokepoints were identified, in dependency order:

1. **Runtime consumption model** — how the webhook loads config at request time (compiled package vs. live query, caching, which of the 3 in-repo sources becomes canonical). **Chosen to resolve first**, because the current fast-path runtime is 100% deterministic exact/alias matching (no fuzzy/semantic matching anywhere) — whatever the KB authoring workflow produces has to bottom out in that same structured shape, so the runtime's target shape has to be settled before the authoring UX or input modality can be designed against it. This also subsumes the existing technical debt (no build step, no caching, 3 disconnected sources) rather than treating it as separate pre-work — patching the old JSON-file system first would be throwaway work once a Supabase-backed runtime exists.
2. **KB authoring workflow** — how a tenant actually builds their menu/services/deterministic flow in the tool; whether an AI-assisted step converts loose tenant input into structured KB rows (a distinct "authoring-time compile," separate from the runtime-time compile in #1).
3. **Input modality** — PDF upload vs. structured form fields vs. hybrid. Judged the least architecturally binding — once the target schema is settled, this is a UX-layer decision on top of it.

First concrete step under #1: since Supabase's config tables (`Physical_Schema_v0.1.md`) already existed but held none of the actual demo property's data, populate them from the current `property_packages/demo/*.json` files as the reference case — using the schema (and the already-resolved field mapping in `Demo_Data_to_Schema_Mapping_v0.3.md`) as the unification target, rather than unifying the 3 in-repo sources into a fourth throwaway format first. **Done — see "KB seed migration" below.** This intentionally does not yet touch `webhook.js` or `runtime_packages` (the compiled-package build step) — that's the next piece of chokepoint #1.

## Runtime package compilation — design resolved 2026-07-22

Working through chokepoint #1's second half (see "Sequencing — resolved" above). None of this has been built yet — design only, no code changes.

1. **Trigger**: compile only when the tenant edits their configuration (adds a team, changes hours, edits a menu) — not per guest message, not on a schedule. The compiled package holds **only tenant-wide static config, never a specific guest's open request** — a reservation being built or an incident being reported stays in the existing `cases`/`reservation_details`/session-state machinery, which changes per-message. Bundling guest-specific data into the package would force recompilation on every turn and break the whole caching model below. (Aside, unrelated to this design but worth remembering: session state — `fast_path_context`, `selected_restaurant`, etc. — currently lives only in `webhook.js`'s in-memory `sessions` object, not Supabase at all, so it doesn't survive a Render restart. Pre-existing, separate concern.)
2. **`menu_options.next_branch_key` completeness**: compile whatever the tenant actually defined; an option with no next branch just has an empty field — no validation, no compile error, no completeness requirement.
3. **Versioning**: simple auto-incrementing integer (or timestamp) on `runtime_packages.runtime_package_version`, assigned automatically by the compile script — no tenant involvement.
4. **Rollback / "bad publish"**: resolved by *not* building server-side package version history. Instead, the future Tenant Property Configuration Tool will let a tenant download their current config as a file — their own manual backup, restorable by re-uploading. Server-side history deferred, revisit only if actually needed later.
5. **Compile logic**: a script, structurally the mirror of `logs/seed_kb_from_demo_package.py` — reads Supabase config tables → writes one `package_json` blob, instead of JSON files → Supabase tables. Starts as a manually-run script (same posture as the seed script); automating "tenant clicks Publish" waits until the mockup tool exists.
6. **Package contents**: everything populated in the KB seed migration below — venues+aliases+descriptions, menu branches/options/aliases/triggers, response templates, reservation rules, answer boundaries, teams, property settings/feature flags — flattened into one blob per property. No guest-specific data (per #1).
7. **Generic graph-walker, confirmed** over keeping `fast_path_classifier.js`/`fast_path_responder.js`'s hardcoded per-context `if` blocks — required because tenants need to be able to add new menu branches the code was never written to know about. **Gated**: the actual rewrite of those two files is deferred until the Tenant Property Configuration Tool exists and has been proven end-to-end with at least one tenant configured similarly to the demo property. The package shape and compile script can be built now; `webhook.js`/`fast_path_*.js` stay untouched until that gate is met.
8. **Caching**: webhook loads the package once and keeps it in memory, reloading only when a new version is published — this falls directly out of #1 (config only changes on tenant edit, so there's nothing to gain from reloading more often).
9. **Cutover strategy**: big-bang (swap all 4 JSON-load call sites at once) rather than an incremental parallel-run — acceptable because of the existing `dev`/`main` branch separation (temporary breakage in `dev` during the rewire is fine; `main` stays the safe rollback point). Distinguish this from #4: that's *config* rollback (tenant-side download), this is *code* rollback (git).

## Runtime package compile script — done 2026-07-22

`logs/compile_runtime_package.py` implements the design above. Reads the config tables populated by the KB seed migration below and writes one row into `runtime_packages` (`package_json` JSONB, `runtime_package_version` auto-incrementing text, `source_schema_version: "physical_schema_v0.1"`, `published_at` set immediately — every run is treated as a publish, no draft/review gate yet). Run manually, same posture as the seed script: `cd logs && source venv/bin/activate && python compile_runtime_package.py`.

Shape is built around the `next_branch_key` graph (the generic-graph-walker target), not the old `menu_dictionary.json` structure — `menu_branches` is an object keyed by `branch_key`, each with `parent_branch_key`, its `options[]` (each carrying `next_branch_key`, nullable), `aliases[]`, and `list_triggers[]`. Verified against the demo property: `next_branch_key` correctly reproduces the `restaurants_menu`→`restaurant_followup_menu` and `loyalty_rewards_menu`→its two sub-menus edges; `answer_boundaries` and venue detail (aliases + bilingual descriptions) round-trip correctly.

Every run inserts a new versioned row rather than overwriting (free history, per the schema's own design), even though no rollback UI consumes that history yet (rollback is handled via the tenant's own config-file download, per the design section above). Does not touch `webhook.js` — nothing reads `runtime_packages` yet; that's the still-gated rewire.

## KB seed migration — done 2026-07-21

`logs/seed_kb_from_demo_package.py` transformed `property_packages/demo/*.json` into the Supabase config tables. Full detail (what changed per table, decisions on ambiguous fields, idempotency handling) recorded in `DB_Construction_Decisions_v0.1.md` → "Resolved — KB Seed Migration (Demo Data → Config Tables round, 2026-07-21)". Growing list of items surfaced but deliberately deferred (case_type/dept_target/template_key are unbuilt and net-new for the mockup tool to define; `menu_branches` reprompt-template column; `"__back"` navigation semantics; `runtime_feature_flags` ownership should likely move to tenant/Property-Admin-editable) is recorded in that same doc's "Open — flagged as future work, not started" table — check there before re-deriving these from scratch.

## Critical files to load into context for this work

**Webhook fast-path system:**
- `webhook.js` — `KNOWN_RESERVATION_VENUES` (~1393-1400), `extractKnownReservationVenue`/`extractSingleVenueFromReply`/`extractReservationVenue` (~1402-1480+), the 4 `loadPropertyPackage()` call sites (~2910, 2981, 3426, 3937)
- `src/fast_path/property_loader.js` — `safeRequireJson`, `loadPropertyPackage`, `loadResponseTemplates`
- `src/fast_path/fast_path_responder.js` — `getSelectableRestaurants`, `buildRestaurantList`, `resolveRestaurantByKey`, `buildResponse`
- `src/fast_path/fast_path_classifier.js` — `classifyFastPath`

**Static config data (source of truth today):**
- `property_packages/demo/property_config.json` — loaded but **never actually read downstream** (dead weight, confirm before touching)
- `property_packages/demo/property_master_data.json` — `dining.venues[]` (7 entries incl. Room Service), `dining.reservation_facts`, `dining.hours_boundary`, `dining.escalation_routing`
- `property_packages/demo/menu_dictionary.json` — the `menus{}` tree
- `property_packages/demo/response_templates_en.json` / `response_templates_es.json` / `response_templates.json`
- `property_packages/demo/fast_path_triggers.json` — **dead, unreferenced**, confirm before deleting or reviving

**Supabase side (already built, mostly unused by the webhook):**
- `supabase_bridge/supabase_client.js` — `resolveVenueId()` is the one existing (narrow) Supabase config read
- `docs/db_planning/Physical_Schema_v0.1.md` — full target schema for `venues`, `venue_aliases`, `venue_descriptions`, `venue_hours`, `menu_branches`, `menu_options`, `menu_option_aliases`, `menu_branch_triggers`, `answer_boundaries`, `response_templates`, `reservation_rules`, `runtime_feature_flags`, `property_settings`, `teams`, `runtime_packages` (the never-built compiled-package table)
- `docs/db_planning/DB_Construction_Decisions_v0.1.md` — records the venue_id fix and originally flagged this exact gap as "Open — flagged as future work, not started"
- `docs/db_planning/Tenant_Management_Future_Considerations_v0.1.md` — explicit "do not build against this document yet" re: multi-tenant/auth; stay in single-tenant (`sol_demo`/`demo`) scope
- `Tenant_Property_Configuration_v0.2.html` (repo root) — the static mockup; treat any field/data shape in it as a *design reference*, not a working integration

## How to read the live database to continue this work

- **Python side** (reliable, already working): `cd logs && source venv/bin/activate`, then `from logs_db import get_client, get_property_id` — `get_client()` returns an authenticated `supabase-py` client (reads `logs/.env` via `python-dotenv`), `get_property_id()` resolves the single demo property's UUID. Query any table directly, e.g. `client.table("venues").select("*").eq("property_id", get_property_id()).execute()`.
- **Schema changes**: `supabase migration new <name>`, write SQL, then `supabase db push --linked --dry-run` to preview, `supabase db push --linked` to apply. This path works reliably.
- **Seed data**: do **not** rely on `supabase db push --linked --include-seed` — confirmed this session that it silently no-ops (updates its tracked hash without executing the SQL) when Docker isn't running locally, which it wasn't. Insert seed data directly via the Python client (`client.table(...).upsert(...)`) instead, and update `supabase/seed.sql` afterward for documentation purposes only, not as the actual application path.
- **Node/webhook side**: **Node.js is not installed on this Mac** (confirmed: no `node`/`npm`/`nvm` anywhere in PATH or standard install locations). `webhook.js` has apparently never been run locally — it only runs on Render. Verifying any webhook.js change requires committing, pushing to `dev` (Render auto-deploys from `dev`), and testing via a real WhatsApp message, then inspecting the result in Supabase via the Python path above.

## Project-level facts still true

- Single-tenant demo scope only: `tenant_key=sol_demo`, `property_key=demo`. No multi-tenant work in scope.
- Branch strategy: `dev` → `main`, all work happens on `dev`, Render auto-deploys from `dev`.
- RLS is enabled on every Supabase table with zero policies (deny-all except `service_role`, which bypasses it). Both the webhook and LOGS use the same `service_role` key — interim, documented, not yet scoped down.
- LOGS dashboard (`logs/logs_app.py`) already reads/writes Supabase directly (no ingestion script) — see `whatsapp_db_logs_adaptation_v0.1.md` for that unrelated but adjacent piece of work.

## Reference

Full context: `Physical_Schema_v0.1.md`, `DB_Construction_Decisions_v0.1.md`, `whatsapp_db_logs_adaptation_v0.1.md`, `Tenant_Management_Future_Considerations_v0.1.md` in this folder.
